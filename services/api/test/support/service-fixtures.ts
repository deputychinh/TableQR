/**
 * Service-floor fixtures written straight to the database, so kitchen and serving tests do not
 * depend on the ordering flow (built in parallel, TQR-011…013). Items are inserted the way a
 * released order leaves them: status `waiting` with `queue_at` set (ADR 0005).
 */
import { sql } from 'drizzle-orm';
import type { Database } from '../../src/db/database.module.js';
import { categories, menuItems, stations } from '../../src/menu/menu.schema.js';
import { publish } from '../../src/realtime/publisher.js';
import { orderItems, orders, tableSessions } from '../../src/service/service.schema.js';
import { diningTables } from '../../src/tables/tables.schema.js';

export type FixtureItemStatus = 'pending' | 'waiting' | 'cooking' | 'done' | 'served' | 'cancelled';

export interface Dish {
  id: string;
  name: string;
  stationId: string;
  priceVnd: number;
}

export interface Floor {
  restaurantId: string;
  stationId: string;
  barId: string;
  pho: Dish;
  bun: Dish;
  tra: Dish;
  tableIds: string[];
}

let counter = 0;

/** Two stations (Bếp nóng 15 min, Quầy bar 5 min), three dishes and `tables` tables. */
export const seedFloor = async (db: Database, restaurantId: string, tables = 3): Promise<Floor> => {
  counter += 1;
  const [hot, bar] = await db
    .insert(stations)
    .values([
      { restaurantId, name: `Bếp nóng ${String(counter)}`, lateAfterMinutes: 15 },
      { restaurantId, name: `Quầy bar ${String(counter)}`, lateAfterMinutes: 5 },
    ])
    .returning({ id: stations.id });
  const [category] = await db
    .insert(categories)
    .values({ restaurantId, name: `Món ${String(counter)}`, isMain: true, sortOrder: counter })
    .returning({ id: categories.id });
  if (!hot || !bar || !category) throw new Error('seedFloor: insert failed');
  const dish = async (name: string, stationId: string, priceVnd: number): Promise<Dish> => {
    const [row] = await db
      .insert(menuItems)
      .values({ restaurantId, categoryId: category.id, stationId, name, priceVnd })
      .returning({ id: menuItems.id });
    if (!row) throw new Error('seedFloor: dish insert failed');
    return { id: row.id, name, stationId, priceVnd };
  };
  const tableRows = await db
    .insert(diningTables)
    .values(
      Array.from({ length: tables }, (_, i) => ({
        restaurantId,
        name: `Bàn ${String(i + 1)}`,
        seats: 4,
        qrToken: `qr-${String(counter)}-${String(i)}-${String(Date.now())}`,
      })),
    )
    .returning({ id: diningTables.id });
  return {
    restaurantId,
    stationId: hot.id,
    barId: bar.id,
    pho: await dish('Phở bò tái', hot.id, 45_000),
    bun: await dish('Bún chả', hot.id, 40_000),
    tra: await dish('Trà đá', bar.id, 5_000),
    tableIds: tableRows.map((t) => t.id),
  };
};

export interface Session {
  id: string;
  openedAt: Date;
}

export const openSession = async (
  db: Database,
  restaurantId: string,
  tableId: string,
  options: { partySize?: number; openedAt?: Date } = {},
): Promise<Session> => {
  const [row] = await db
    .insert(tableSessions)
    .values({
      restaurantId,
      tableId,
      partySize: options.partySize ?? 2,
      openedAt: options.openedAt ?? new Date(),
      openedBy: 'staff',
    })
    .returning({ id: tableSessions.id, openedAt: tableSessions.openedAt });
  if (!row) throw new Error('openSession: insert failed');
  return row;
};

export interface Line {
  dish: Dish;
  quantity?: number;
  note?: string;
  status?: FixtureItemStatus;
}

export interface SeededItem {
  id: string;
  seq: number;
  version: number;
  stationId: string;
  menuItemId: string;
  status: FixtureItemStatus;
}

/**
 * One released order: its lines enter the queue at `queueAt` (a Date, or an ISO string to keep
 * microseconds). With `publishEvents`, sends `item.status` `waiting` on each station topic, as
 * the ordering flow does when it releases an order.
 */
export const releaseOrder = async (
  db: Database,
  restaurantId: string,
  session: Session,
  lines: readonly Line[],
  options: { queueAt?: Date | string; publishEvents?: boolean } = {},
): Promise<SeededItem[]> => {
  counter += 1;
  const queueAt = options.queueAt ?? new Date();
  const queueAtValue = typeof queueAt === 'string' ? sql`${queueAt}::timestamptz` : queueAt;
  return db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({
        restaurantId,
        sessionId: session.id,
        idempotencyKey: `fixture-${String(counter)}-${String(Date.now())}`,
        status: 'released',
        placedBy: 'guest',
        totalVnd: lines.reduce((sum, l) => sum + l.dish.priceVnd * (l.quantity ?? 1), 0),
        rulesSnapshot: {},
        releasedAt: new Date(),
      })
      .returning({ id: orders.id });
    if (!order) throw new Error('releaseOrder: order insert failed');
    const items = await tx
      .insert(orderItems)
      .values(
        lines.map((line) => ({
          restaurantId,
          orderId: order.id,
          sessionId: session.id,
          menuItemId: line.dish.id,
          stationId: line.dish.stationId,
          nameSnapshot: line.dish.name,
          priceVnd: line.dish.priceVnd,
          isMain: 'yes' as const,
          quantity: line.quantity ?? 1,
          note: line.note ?? null,
          status: line.status ?? 'waiting',
          queueAt: line.status === 'pending' ? null : queueAtValue,
          sessionOpenedAt: session.openedAt,
        })),
      )
      .returning({
        id: orderItems.id,
        seq: orderItems.seq,
        version: orderItems.version,
        stationId: orderItems.stationId,
        menuItemId: orderItems.menuItemId,
        status: orderItems.status,
      });
    if (options.publishEvents) {
      for (const item of items) {
        await publish(tx, {
          restaurantId,
          topic: `station:${item.stationId}`,
          type: 'item.status',
          data: { itemId: item.id, status: item.status, version: item.version },
        });
      }
    }
    return items;
  });
};
