import { randomBytes } from 'node:crypto';
import type { Database } from '../../src/db/database.module.js';
import {
  categories,
  diningTables,
  guestDevices,
  menuItems,
  orderItems,
  orders,
  stations,
  tableSessions,
} from '../../src/db/schema.js';
import { hashToken, newSessionToken } from '../../src/identity/domain/session-token.js';
import { DEFAULT_RULES, snapshotRules } from '../../src/settings/domain/house-rules.js';

/**
 * Service-floor rows inserted straight into the database, so billing can be tested before the
 * guest ordering and kitchen items (TQR-011…016) exist. Shapes follow `service.schema.ts`.
 */
export interface FloorFixture {
  restaurantId: string;
  stationId: string;
  menuItemId: string;
}

export interface SessionFixture {
  sessionId: string;
  tableId: string;
  /** Raw `tqr_guest` cookie value for a phone joined to the session. */
  guestToken: string;
  guestCookie: string;
}

let counter = 0;

export const seedMenu = async (db: Database, restaurantId: string): Promise<FloorFixture> => {
  const [station] = await db
    .insert(stations)
    .values({ restaurantId, name: 'Bếp chính' })
    .returning({ id: stations.id });
  const [category] = await db
    .insert(categories)
    .values({ restaurantId, name: 'Món chính', isMain: true, sortOrder: 1 })
    .returning({ id: categories.id });
  if (!station || !category) throw new Error('seed failed');
  const [item] = await db
    .insert(menuItems)
    .values({
      restaurantId,
      categoryId: category.id,
      stationId: station.id,
      name: 'Phở bò',
      priceVnd: 50_000,
    })
    .returning({ id: menuItems.id });
  if (!item) throw new Error('seed failed');
  return { restaurantId, stationId: station.id, menuItemId: item.id };
};

/** A new table with an open session and one joined guest phone. */
export const openSession = async (
  db: Database,
  floor: FloorFixture,
  tableName?: string,
): Promise<SessionFixture> => {
  counter += 1;
  const [table] = await db
    .insert(diningTables)
    .values({
      restaurantId: floor.restaurantId,
      name: tableName ?? `Bàn F${String(counter)}`,
      seats: 4,
      qrToken: randomBytes(16).toString('base64url'),
    })
    .returning({ id: diningTables.id });
  if (!table) throw new Error('seed failed');
  const [session] = await db
    .insert(tableSessions)
    .values({
      restaurantId: floor.restaurantId,
      tableId: table.id,
      partySize: 2,
      openedBy: 'guest',
    })
    .returning({ id: tableSessions.id });
  if (!session) throw new Error('seed failed');
  const guestToken = newSessionToken();
  await db.insert(guestDevices).values({
    tokenHash: hashToken(guestToken),
    restaurantId: floor.restaurantId,
    sessionId: session.id,
  });
  return {
    sessionId: session.id,
    tableId: table.id,
    guestToken,
    guestCookie: `tqr_guest=${guestToken}`,
  };
};

export interface LineSeed {
  name?: string;
  priceVnd: number;
  quantity: number;
  status?: 'pending' | 'waiting' | 'cooking' | 'done' | 'served' | 'cancelled';
}

/** An order with its items; `awaiting_payment` orders get `pending` items without `queue_at`. */
export const addOrder = async (
  db: Database,
  floor: FloorFixture,
  session: SessionFixture,
  status: 'held' | 'awaiting_payment' | 'released' | 'rejected' | 'cancelled',
  lines: LineSeed[],
  requestedAt: Date = new Date(),
): Promise<{ orderId: string; itemIds: string[] }> => {
  counter += 1;
  const total = lines.reduce((sum, line) => sum + line.priceVnd * line.quantity, 0);
  const rules = {
    ...DEFAULT_RULES,
    paymentTiming: status === 'awaiting_payment' ? 'pay_before' : 'pay_after',
  } as const;
  const [order] = await db
    .insert(orders)
    .values({
      restaurantId: floor.restaurantId,
      sessionId: session.sessionId,
      idempotencyKey: `seed-${String(counter)}`,
      status,
      placedBy: 'guest',
      requestedAt,
      releasedAt: status === 'released' ? requestedAt : null,
      totalVnd: total,
      rulesSnapshot: snapshotRules(rules, null),
    })
    .returning({ id: orders.id });
  if (!order) throw new Error('seed failed');
  const defaultStatus = status === 'released' ? 'waiting' : 'pending';
  const items = await db
    .insert(orderItems)
    .values(
      lines.map((line) => ({
        restaurantId: floor.restaurantId,
        orderId: order.id,
        sessionId: session.sessionId,
        menuItemId: floor.menuItemId,
        stationId: floor.stationId,
        nameSnapshot: line.name ?? 'Phở bò',
        priceVnd: line.priceVnd,
        isMain: 'yes' as const,
        quantity: line.quantity,
        status: line.status ?? defaultStatus,
        queueAt: status === 'released' ? requestedAt : null,
        sessionOpenedAt: requestedAt,
      })),
    )
    .returning({ id: orderItems.id });
  return { orderId: order.id, itemIds: items.map((item) => item.id) };
};
