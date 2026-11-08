import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../common/clock.js';
import { syncOpenBill } from '../billing/bill-sync.js';
import { ErrorCode } from '../common/enums/error-code.enum.js';
import { DomainError } from '../common/errors/domain.error.js';
import type { TenantId } from '../common/tenant.js';
import { DB, type Database } from '../db/database.module.js';
import { restaurants } from '../db/schema.js';
import { categories, menuItems } from '../menu/menu.schema.js';
import { publish } from '../realtime/publisher.js';
import {
  readStoredRules,
  snapshotRules,
  type HouseRules,
  type RulesSnapshot,
} from '../settings/domain/house-rules.js';
import { diningTables } from '../tables/tables.schema.js';
import { checkOrder, ordersToRelease, type HoldReason } from './domain/anomaly.js';
import {
  afterApproval,
  initialOrderStatus,
  isUuid,
  priceCart,
  type CartLine,
  type MenuEntry,
  type OrderStatus,
} from './domain/ordering.js';
import { menuChanged, orderNotHeld, sessionClosed } from './domain/service-errors.js';
import { orderItems, orders, tableSessions } from './service.schema.js';

export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/** AC27 flag values: raised at placement, marked seen by a waiter. */
export const FLAG_MAYBE_SHORT = 'maybe_short';
export const FLAG_MAYBE_SHORT_SEEN = 'maybe_short_seen';

export interface OrderItemView {
  id: string;
  menuItemId: string;
  name: string;
  priceVnd: number;
  quantity: number;
  note: string | null;
  isMain: boolean;
  status: string;
  version: number;
}

export interface OrderView {
  id: string;
  status: OrderStatus;
  holdReason: HoldReason | null;
  requestedAt: string;
  totalVnd: number;
  /** From the order's rules snapshot (AC12): the anomaly limit is party size × this. */
  maxMainPerPerson: number;
  items: OrderItemView[];
}

export interface ReviewOrder extends OrderView {
  flag: string | null;
  mainPortions: number;
  /** Main portions of the whole session that still count (not cancelled), this order included. */
  sessionMainPortions: number;
  session: { id: string; partySize: number; openedAt: string };
  table: { id: string; name: string };
}

export interface PlaceResult {
  order: OrderView;
  /** False when the idempotency key was seen before and the first order is returned (AC24). */
  created: boolean;
}

const notFound = (): DomainError => new DomainError(ErrorCode.NotFound, 404);

const itemColumns = {
  id: orderItems.id,
  orderId: orderItems.orderId,
  menuItemId: orderItems.menuItemId,
  name: orderItems.nameSnapshot,
  priceVnd: orderItems.priceVnd,
  quantity: orderItems.quantity,
  note: orderItems.note,
  isMain: orderItems.isMain,
  status: orderItems.status,
  version: orderItems.version,
};

const orderColumns = {
  id: orders.id,
  status: orders.status,
  holdReason: orders.holdReason,
  flag: orders.flag,
  requestedAt: orders.requestedAt,
  totalVnd: orders.totalVnd,
  sessionId: orders.sessionId,
  rulesSnapshot: orders.rulesSnapshot,
};

interface ItemRow {
  id: string;
  orderId: string;
  menuItemId: string;
  name: string;
  priceVnd: number;
  quantity: number;
  note: string | null;
  isMain: 'yes' | 'no';
  status: string;
  version: number;
}

interface OrderRow {
  id: string;
  status: OrderStatus;
  holdReason: string | null;
  flag: string | null;
  requestedAt: Date;
  totalVnd: number;
  sessionId: string;
  rulesSnapshot: unknown;
}

const toItemView = (row: ItemRow): OrderItemView => ({
  id: row.id,
  menuItemId: row.menuItemId,
  name: row.name,
  priceVnd: row.priceVnd,
  quantity: row.quantity,
  note: row.note,
  isMain: row.isMain === 'yes',
  status: row.status,
  version: row.version,
});

/** Rules an order was placed under (AC12): its snapshot, never the restaurant's current rules. */
const rulesOf = (snapshot: unknown): HouseRules =>
  readStoredRules((snapshot as Partial<RulesSnapshot> | null)?.rules ?? {});

const toOrderView = (row: OrderRow, items: readonly ItemRow[]): OrderView => ({
  id: row.id,
  status: row.status,
  holdReason: (row.holdReason as HoldReason | null) ?? null,
  requestedAt: row.requestedAt.toISOString(),
  totalVnd: row.totalVnd,
  maxMainPerPerson: rulesOf(row.rulesSnapshot).anomaly.maxMainPerPerson,
  items: items.filter((item) => item.orderId === row.id).map(toItemView),
});

/**
 * Orders of the service floor: guest placement with price check, anomaly hold and idempotency
 * (AC22–AC29), waiter confirm / reject, and the AC20 re-check. Every query carries the tenant.
 */
@Injectable()
export class OrdersService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // --- guest -----------------------------------------------------------------

  /**
   * AC22–AC27, AC29: one transaction with the session row locked, so two phones of one table are
   * judged one after the other (AC23) and a retried key finds the first order (AC24).
   */
  async place(
    tenant: TenantId,
    sessionId: string,
    idempotencyKey: string,
    lines: readonly CartLine[],
  ): Promise<PlaceResult> {
    return this.db.transaction(async (tx) => {
      const [session] = await tx
        .select({
          status: tableSessions.status,
          partySize: tableSessions.partySize,
          openedAt: tableSessions.openedAt,
        })
        .from(tableSessions)
        .where(and(eq(tableSessions.restaurantId, tenant), eq(tableSessions.id, sessionId)))
        .for('update');
      if (!session) throw notFound();

      const [existing] = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(
            eq(orders.restaurantId, tenant),
            eq(orders.sessionId, sessionId),
            eq(orders.idempotencyKey, idempotencyKey),
          ),
        );
      if (existing) return { order: await this.loadOrder(tx, tenant, existing.id), created: false };
      if (session.status !== 'open') throw sessionClosed();

      const priced = priceCart(lines, await this.menuEntries(tx, tenant, lines));
      if (!priced.ok) throw menuChanged(priced.problems);

      const [restaurant] = await tx
        .select({ rules: restaurants.rules, rulesUpdatedAt: restaurants.rulesUpdatedAt })
        .from(restaurants)
        .where(eq(restaurants.id, tenant));
      if (!restaurant) throw notFound();
      const rules = readStoredRules(restaurant.rules);
      const counted = await this.countedPortions(tx, tenant, sessionId);
      const check = checkOrder({
        partySize: session.partySize,
        mainPortionsBefore: counted.mainPortions,
        mainPortionsInOrder: priced.mainPortions,
        isFirstOrder: counted.orders === 0,
        rules,
      });
      const hold = check.decision === 'hold' ? check.reason : undefined;
      const status = initialOrderStatus(hold, rules);
      const now = this.clock.now();

      const [order] = await tx
        .insert(orders)
        .values({
          restaurantId: tenant,
          sessionId,
          idempotencyKey,
          status,
          holdReason: hold ?? null,
          flag: check.decision === 'flag-short' ? FLAG_MAYBE_SHORT : null,
          placedBy: 'guest',
          requestedAt: now,
          releasedAt: status === 'released' ? now : null,
          totalVnd: priced.totalVnd,
          rulesSnapshot: snapshotRules(rules, restaurant.rulesUpdatedAt),
        })
        .returning({ id: orders.id });
      if (!order) throw new Error('order insert returned no row');
      const released = status === 'released';
      const items = await tx
        .insert(orderItems)
        .values(
          priced.lines.map((line) => ({
            restaurantId: tenant,
            orderId: order.id,
            sessionId,
            menuItemId: line.menuItemId,
            stationId: line.stationId,
            nameSnapshot: line.name,
            priceVnd: line.priceVnd,
            isMain: line.isMain ? ('yes' as const) : ('no' as const),
            quantity: line.quantity,
            note: line.note,
            status: released ? ('waiting' as const) : ('pending' as const),
            queueAt: released ? now : null,
            sessionOpenedAt: session.openedAt,
          })),
        )
        .returning({
          id: orderItems.id,
          stationId: orderItems.stationId,
          version: orderItems.version,
        });

      await this.publishOrder(tx, tenant, sessionId, order.id, status);
      if (released) await this.publishReleasedItems(tx, tenant, items);
      // AC42: a released or pay-before order changes what the table owes; an open bill follows.
      if (status !== 'held')
        await syncOpenBill(tx, tenant, sessionId, now, { issueWhenNone: false });
      return { order: await this.loadOrder(tx, tenant, order.id), created: true };
    });
  }

  /** The session's orders and items, oldest first (guest order page and stream snapshot). */
  async sessionOrders(tenant: TenantId, sessionId: string): Promise<OrderView[]> {
    const [orderRows, itemRows] = await Promise.all([
      this.db
        .select(orderColumns)
        .from(orders)
        .where(and(eq(orders.restaurantId, tenant), eq(orders.sessionId, sessionId)))
        .orderBy(asc(orders.requestedAt), asc(orders.id)),
      this.db
        .select(itemColumns)
        .from(orderItems)
        .where(and(eq(orderItems.restaurantId, tenant), eq(orderItems.sessionId, sessionId)))
        .orderBy(asc(orderItems.seq)),
    ]);
    return orderRows.map((row) => toOrderView(row, itemRows));
  }

  // --- waiter ----------------------------------------------------------------

  /** Held orders and "có thể thiếu món" flags of open sessions, oldest first (AC26, AC27). */
  async reviewList(tenant: TenantId): Promise<ReviewOrder[]> {
    const rows = await this.db
      .select({
        ...orderColumns,
        partySize: tableSessions.partySize,
        openedAt: tableSessions.openedAt,
        tableId: diningTables.id,
        tableName: diningTables.name,
      })
      .from(orders)
      .innerJoin(
        tableSessions,
        and(
          eq(tableSessions.restaurantId, orders.restaurantId),
          eq(tableSessions.id, orders.sessionId),
        ),
      )
      .innerJoin(
        diningTables,
        and(
          eq(diningTables.restaurantId, tableSessions.restaurantId),
          eq(diningTables.id, tableSessions.tableId),
        ),
      )
      .where(
        and(
          eq(orders.restaurantId, tenant),
          eq(tableSessions.status, 'open'),
          or(eq(orders.status, 'held'), eq(orders.flag, FLAG_MAYBE_SHORT)),
        ),
      )
      .orderBy(asc(orders.requestedAt), asc(orders.id))
      .limit(200);
    if (rows.length === 0) return [];
    const items = await this.db
      .select(itemColumns)
      .from(orderItems)
      .where(
        and(
          eq(orderItems.restaurantId, tenant),
          inArray(
            orderItems.orderId,
            rows.map((row) => row.id),
          ),
        ),
      )
      .orderBy(asc(orderItems.seq));
    const sessionIds = [...new Set(rows.map((row) => row.sessionId))];
    const sessionMains = await this.db
      .select({
        sessionId: orderItems.sessionId,
        main: sql<number>`coalesce(sum(${orderItems.quantity}) filter (where ${orderItems.isMain} = 'yes'), 0)::int`,
      })
      .from(orderItems)
      .where(
        and(
          eq(orderItems.restaurantId, tenant),
          inArray(orderItems.sessionId, sessionIds),
          ne(orderItems.status, 'cancelled'),
        ),
      )
      .groupBy(orderItems.sessionId);
    const mainsOf = new Map(sessionMains.map((row) => [row.sessionId, row.main]));
    return rows.map((row) => {
      const view = toOrderView(row, items);
      return {
        ...view,
        flag: row.flag,
        mainPortions: view.items.reduce((sum, item) => sum + (item.isMain ? item.quantity : 0), 0),
        sessionMainPortions: mainsOf.get(row.sessionId) ?? 0,
        session: {
          id: row.sessionId,
          partySize: row.partySize,
          openedAt: row.openedAt.toISOString(),
        },
        table: { id: row.tableId, name: row.tableName },
      };
    });
  }

  /** AC28: release with the original request time as queue position (ADR 0005). */
  async confirm(tenant: TenantId, orderId: string, userId: string): Promise<OrderView> {
    if (!isUuid(orderId)) throw notFound();
    return this.db.transaction(async (tx) => {
      // Session row first, as bill requests, payments and closing do, so an open bill is updated
      // in step (AC42) and the lock order never deadlocks with closing the table.
      const [target] = await tx
        .select({ sessionId: orders.sessionId })
        .from(orders)
        .where(and(eq(orders.restaurantId, tenant), eq(orders.id, orderId)));
      if (!target) throw notFound();
      await tx
        .select({ id: tableSessions.id })
        .from(tableSessions)
        .where(and(eq(tableSessions.restaurantId, tenant), eq(tableSessions.id, target.sessionId)))
        .for('update');
      const order = await this.lockHeld(tx, tenant, orderId);
      await this.approve(tx, tenant, order, userId);
      return this.loadOrder(tx, tenant, orderId);
    });
  }

  /** AC28: a rejected order is cancelled with all its items and the guest is told. */
  async reject(tenant: TenantId, orderId: string, userId: string): Promise<OrderView> {
    return this.db.transaction(async (tx) => {
      const order = await this.lockHeld(tx, tenant, orderId);
      await tx
        .update(orders)
        .set({ status: 'rejected', decidedBy: userId })
        .where(and(eq(orders.restaurantId, tenant), eq(orders.id, orderId)));
      await tx
        .update(orderItems)
        .set({ status: 'cancelled', version: sql`${orderItems.version} + 1` })
        .where(and(eq(orderItems.restaurantId, tenant), eq(orderItems.orderId, orderId)));
      await this.publishOrder(tx, tenant, order.sessionId, orderId, 'rejected');
      return this.loadOrder(tx, tenant, orderId);
    });
  }

  /** The waiter has seen an AC27 flag; the order leaves the review list (it was never held). */
  async markFlagSeen(tenant: TenantId, orderId: string): Promise<void> {
    if (!isUuid(orderId)) throw notFound();
    const [row] = await this.db
      .update(orders)
      .set({
        flag: sql`case when ${orders.flag} = ${FLAG_MAYBE_SHORT} then ${FLAG_MAYBE_SHORT_SEEN} else ${orders.flag} end`,
      })
      .where(and(eq(orders.restaurantId, tenant), eq(orders.id, orderId)))
      .returning({ sessionId: orders.sessionId, status: orders.status });
    if (!row) throw notFound();
    await publish(this.db, {
      restaurantId: tenant,
      topic: 'floor',
      type: 'order.status',
      data: { orderId, status: row.status },
    });
  }

  /**
   * AC20: after a party-size change, anomaly-held orders that now pass are released as if a
   * waiter confirmed them. Runs inside the caller's transaction (session row already locked).
   */
  async recheckHeld(tx: Tx, tenant: TenantId, sessionId: string, partySize: number): Promise<void> {
    const held = await tx
      .select({
        id: orders.id,
        sessionId: orders.sessionId,
        holdReason: orders.holdReason,
        rulesSnapshot: orders.rulesSnapshot,
        requestedAt: orders.requestedAt,
      })
      .from(orders)
      .where(
        and(
          eq(orders.restaurantId, tenant),
          eq(orders.sessionId, sessionId),
          eq(orders.status, 'held'),
        ),
      )
      .orderBy(asc(orders.requestedAt), asc(orders.id))
      .for('update');
    if (held.length === 0) return;
    const portions = await tx
      .select({
        orderId: orderItems.orderId,
        main: sql<number>`coalesce(sum(${orderItems.quantity}) filter (where ${orderItems.isMain} = 'yes'), 0)::int`,
      })
      .from(orderItems)
      .where(
        and(
          eq(orderItems.restaurantId, tenant),
          eq(orderItems.sessionId, sessionId),
          ne(orderItems.status, 'cancelled'),
        ),
      )
      .groupBy(orderItems.orderId);
    const mainOf = new Map(portions.map((row) => [row.orderId, row.main]));
    const heldIds = new Set(held.map((order) => order.id));
    const counted = portions
      .filter((row) => !heldIds.has(row.orderId))
      .reduce((sum, row) => sum + row.main, 0);
    const release = new Set(
      ordersToRelease(
        partySize,
        counted,
        held.map((order) => ({
          id: order.id,
          holdReason: order.holdReason === 'every_order' ? 'every_order' : 'anomaly_over',
          mainPortions: mainOf.get(order.id) ?? 0,
          maxMainPerPerson: rulesOf(order.rulesSnapshot).anomaly.maxMainPerPerson,
        })),
      ),
    );
    for (const order of held) {
      if (release.has(order.id)) await this.approve(tx, tenant, order, null);
    }
  }

  // --- internals -------------------------------------------------------------

  private async lockHeld(tx: Tx, tenant: TenantId, orderId: string) {
    if (!isUuid(orderId)) throw notFound();
    const [order] = await tx
      .select({
        id: orders.id,
        sessionId: orders.sessionId,
        status: orders.status,
        rulesSnapshot: orders.rulesSnapshot,
        requestedAt: orders.requestedAt,
      })
      .from(orders)
      .where(and(eq(orders.restaurantId, tenant), eq(orders.id, orderId)))
      .for('update');
    if (!order) throw notFound();
    if (order.status !== 'held') throw orderNotHeld();
    return order;
  }

  /** Held → released (queue at the request time) or awaiting payment, per the order's own rules. */
  private async approve(
    tx: Tx,
    tenant: TenantId,
    order: { id: string; sessionId: string; rulesSnapshot: unknown; requestedAt: Date },
    userId: string | null,
  ): Promise<void> {
    const status = afterApproval(rulesOf(order.rulesSnapshot));
    await tx
      .update(orders)
      .set({
        status,
        releasedAt: status === 'released' ? this.clock.now() : null,
        decidedBy: userId,
      })
      .where(and(eq(orders.restaurantId, tenant), eq(orders.id, order.id)));
    if (status === 'released') {
      const items = await tx
        .update(orderItems)
        .set({
          status: 'waiting',
          queueAt: order.requestedAt,
          version: sql`${orderItems.version} + 1`,
        })
        .where(
          and(
            eq(orderItems.restaurantId, tenant),
            eq(orderItems.orderId, order.id),
            eq(orderItems.status, 'pending'),
          ),
        )
        .returning({
          id: orderItems.id,
          stationId: orderItems.stationId,
          version: orderItems.version,
        });
      await this.publishOrder(tx, tenant, order.sessionId, order.id, status);
      await this.publishReleasedItems(tx, tenant, items);
    } else {
      await this.publishOrder(tx, tenant, order.sessionId, order.id, status);
    }
    // AC42: an accepted order is billable now; an open bill on the guest's phone follows.
    await syncOpenBill(tx, tenant, order.sessionId, this.clock.now(), { issueWhenNone: false });
  }

  private async menuEntries(
    tx: Tx,
    tenant: TenantId,
    lines: readonly CartLine[],
  ): Promise<Map<string, MenuEntry>> {
    const ids = [...new Set(lines.map((line) => line.menuItemId))];
    // Read-only lookup of the menu context's rows, tenant-scoped (ADR 0003): prices come from here.
    const rows = await tx
      .select({
        id: menuItems.id,
        name: menuItems.name,
        priceVnd: menuItems.priceVnd,
        available: menuItems.available,
        stationId: menuItems.stationId,
        isMain: categories.isMain,
      })
      .from(menuItems)
      .innerJoin(
        categories,
        and(
          eq(categories.restaurantId, menuItems.restaurantId),
          eq(categories.id, menuItems.categoryId),
        ),
      )
      .where(and(eq(menuItems.restaurantId, tenant), inArray(menuItems.id, ids)));
    return new Map(rows.map((row) => [row.id, row]));
  }

  /** Main portions and orders that still count in the session (not cancelled / rejected). */
  private async countedPortions(tx: Tx, tenant: TenantId, sessionId: string) {
    const [row] = await tx
      .select({
        mainPortions: sql<number>`coalesce(sum(${orderItems.quantity}) filter (where ${orderItems.isMain} = 'yes'), 0)::int`,
        orders: sql<number>`count(distinct ${orderItems.orderId})::int`,
      })
      .from(orderItems)
      .where(
        and(
          eq(orderItems.restaurantId, tenant),
          eq(orderItems.sessionId, sessionId),
          ne(orderItems.status, 'cancelled'),
        ),
      );
    return { mainPortions: row?.mainPortions ?? 0, orders: row?.orders ?? 0 };
  }

  private async loadOrder(tx: Tx, tenant: TenantId, orderId: string): Promise<OrderView> {
    const [row] = await tx
      .select(orderColumns)
      .from(orders)
      .where(and(eq(orders.restaurantId, tenant), eq(orders.id, orderId)));
    if (!row) throw notFound();
    const items = await tx
      .select(itemColumns)
      .from(orderItems)
      .where(and(eq(orderItems.restaurantId, tenant), eq(orderItems.orderId, orderId)))
      .orderBy(asc(orderItems.seq));
    return toOrderView(row, items);
  }

  /** ADR 0004 contract: order changes go to the floor and the guest's session. */
  private async publishOrder(
    tx: Tx,
    tenant: TenantId,
    sessionId: string,
    orderId: string,
    status: OrderStatus,
  ): Promise<void> {
    for (const topic of ['floor', `session:${sessionId}`]) {
      await publish(tx, {
        restaurantId: tenant,
        topic,
        type: 'order.status',
        data: { orderId, status },
      });
    }
  }

  /** Released items reach their station's queue (consumed by the kitchen, TQR-014). */
  private async publishReleasedItems(
    tx: Tx,
    tenant: TenantId,
    items: readonly { id: string; stationId: string; version: number }[],
  ): Promise<void> {
    for (const item of items) {
      await publish(tx, {
        restaurantId: tenant,
        topic: `station:${item.stationId}`,
        type: 'item.status',
        data: { itemId: item.id, status: 'waiting', version: item.version },
      });
    }
  }
}
