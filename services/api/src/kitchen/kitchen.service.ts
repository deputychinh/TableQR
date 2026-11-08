import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { and, asc, eq, inArray, ne, sql, type SQL } from 'drizzle-orm';
import { syncOpenBill } from '../billing/bill-sync.js';
import { CLOCK, type Clock } from '../common/clock.js';
import type { TenantId } from '../common/tenant.js';
import { DB, type Database } from '../db/database.module.js';
import { restaurants } from '../db/schema.js';
import { stations } from '../menu/menu.schema.js';
import { FloorSnapshotRegistry } from '../realtime/floor-snapshot.js';
import { publish } from '../realtime/publisher.js';
import { orderItems, tableSessions } from '../service/service.schema.js';
import { readStoredRules } from '../settings/domain/house-rules.js';
import { diningTables } from '../tables/tables.schema.js';
import type { DoneInput } from './dto/kitchen.dto.js';
import { nextStatus, type ItemAction, type ItemStatus } from './domain/item-status.js';
import { lateAt } from './domain/late.js';
import { QUEUE_STATUSES, findSkippedOlder } from './domain/queue.js';
import { buildReadyBoard, type ReadyBoard } from './domain/ready-board.js';
import { invalidTransition, notFound, skipReasonRequired, staleVersion } from './kitchen.errors.js';

export interface KitchenStation {
  id: string;
  name: string;
  lateAfterMinutes: number;
  waiting: number;
  cooking: number;
}

/** A kitchen ticket (AC34): table, party size, quantity, dish, note; wait time from `queueAt`. */
export interface Ticket {
  id: string;
  version: number;
  status: 'waiting' | 'cooking';
  /** TQR-027: the screen reads a new order's dishes together ("Bàn 1: hai phở bò, một trà đá"). */
  orderId: string;
  menuItemId: string;
  name: string;
  quantity: number;
  note: string | null;
  sessionId: string;
  tableName: string;
  partySize: number;
  queueAt: string;
  startedAt: string | null;
  /** AC33: after this instant the ticket is late (the station's threshold, applied once here). */
  lateAt: string;
}

export interface StationQueue {
  station: { id: string; name: string; lateAfterMinutes: number };
  /** Lets a screen whose clock is off still count wait time and lateness right. */
  serverTime: string;
  /** TQR-028: the restaurant's spoken overdue reminder (house rule `kitchen`), in minutes. */
  reminder: { minutes: number; repeatMinutes: number };
  items: Ticket[];
}

export interface ItemChange {
  id: string;
  status: ItemStatus;
  version: number;
  skipReason: string | null;
}

/** Microseconds since the epoch, exactly as Postgres stores the timestamp (see domain/queue.ts). */
const epochUs = (column: SQL | typeof orderItems.queueAt) =>
  sql<number>`(extract(epoch from ${column}) * 1000000)::bigint`.mapWith(Number);

/** Station queue order; the same columns as `QUEUE_ORDER_COLUMNS` / `compareQueueItems`. */
const QUEUE_ORDER = [asc(orderItems.queueAt), asc(orderItems.sessionOpenedAt), asc(orderItems.seq)];

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Kitchen queue (S9) and waiter serving (S10). Every query carries the tenant (ADR 0003); every
 * status change is compare-and-set on status + version and publishes `item.status` in the same
 * transaction (ADR 0004/0005).
 */
@Injectable()
export class KitchenService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly floorSnapshot: FloorSnapshotRegistry,
  ) {}

  onModuleInit(): void {
    this.floorSnapshot.register('ready', (tenant) => this.readyBoard(tenant));
  }

  async listStations(tenant: TenantId): Promise<KitchenStation[]> {
    const counts = (status: ItemStatus) =>
      sql<number>`count(${orderItems.id}) filter (where ${orderItems.status} = ${status})`.mapWith(
        Number,
      );
    return this.db
      .select({
        id: stations.id,
        name: stations.name,
        lateAfterMinutes: stations.lateAfterMinutes,
        waiting: counts('waiting'),
        cooking: counts('cooking'),
      })
      .from(stations)
      .leftJoin(
        orderItems,
        and(
          eq(orderItems.restaurantId, stations.restaurantId),
          eq(orderItems.stationId, stations.id),
          inArray(orderItems.status, [...QUEUE_STATUSES]),
        ),
      )
      .where(eq(stations.restaurantId, tenant))
      .groupBy(stations.id)
      .orderBy(asc(stations.createdAt), asc(stations.id));
  }

  /** Throws 404 when the station is not this restaurant's. */
  async assertStation(tenant: TenantId, stationId: string): Promise<StationQueue['station']> {
    const [station] = await this.db
      .select({ id: stations.id, name: stations.name, lateAfterMinutes: stations.lateAfterMinutes })
      .from(stations)
      .where(and(eq(stations.restaurantId, tenant), eq(stations.id, stationId)));
    if (!station) throw notFound();
    return station;
  }

  /** AC30: a station's waiting and cooking items in queue order (released items only). */
  async queue(tenant: TenantId, stationId: string): Promise<StationQueue> {
    const station = await this.assertStation(tenant, stationId);
    const rows = await this.db
      .select({
        id: orderItems.id,
        version: orderItems.version,
        status: orderItems.status,
        orderId: orderItems.orderId,
        menuItemId: orderItems.menuItemId,
        name: orderItems.nameSnapshot,
        quantity: orderItems.quantity,
        note: orderItems.note,
        sessionId: orderItems.sessionId,
        tableName: diningTables.name,
        partySize: tableSessions.partySize,
        queueAt: orderItems.queueAt,
        startedAt: orderItems.startedAt,
      })
      .from(orderItems)
      .innerJoin(
        tableSessions,
        and(
          eq(tableSessions.restaurantId, orderItems.restaurantId),
          eq(tableSessions.id, orderItems.sessionId),
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
          eq(orderItems.restaurantId, tenant),
          eq(orderItems.stationId, stationId),
          inArray(orderItems.status, [...QUEUE_STATUSES]),
          sql`${orderItems.queueAt} is not null`,
        ),
      )
      .orderBy(...QUEUE_ORDER);
    const items = rows.flatMap((row): Ticket[] => {
      if (!row.queueAt || (row.status !== 'waiting' && row.status !== 'cooking')) return [];
      return [
        {
          ...row,
          status: row.status,
          queueAt: row.queueAt.toISOString(),
          startedAt: row.startedAt?.toISOString() ?? null,
          lateAt: lateAt(row.queueAt, station.lateAfterMinutes).toISOString(),
        },
      ];
    });
    return {
      station,
      serverTime: this.clock.now().toISOString(),
      reminder: await this.reminder(tenant),
      items,
    };
  }

  /**
   * TQR-028: the restaurant's current reminder rule. A screen setting, not a judgement of an
   * order, so it is the rule in force now rather than the order's AC12 snapshot.
   */
  private async reminder(tenant: TenantId): Promise<StationQueue['reminder']> {
    const [row] = await this.db
      .select({ rules: restaurants.rules })
      .from(restaurants)
      .where(eq(restaurants.id, tenant));
    const { reminderMinutes, repeatMinutes } = readStoredRules(row?.rules).kitchen;
    return { minutes: reminderMinutes, repeatMinutes };
  }

  /** "Bắt đầu nấu": waiting → cooking. */
  start(tenant: TenantId, itemId: string, version: number): Promise<ItemChange> {
    return this.transition(tenant, itemId, 'start', version, (now) => ({ startedAt: now }));
  }

  /** "Xong": cooking → done; overtaking an older order of the same dish needs a reason (AC32). */
  done(tenant: TenantId, itemId: string, input: DoneInput): Promise<ItemChange> {
    return this.transition(tenant, itemId, 'done', input.version, async (now, tx, item) => {
      const older = await this.olderSameDish(tx, tenant, item);
      if (older.length > 0 && input.skipReason === undefined) {
        throw skipReasonRequired(older.map((o) => ({ itemId: o.id, tableName: o.tableName })));
      }
      return { doneAt: now, skipReason: older.length > 0 ? (input.skipReason ?? null) : null };
    });
  }

  /**
   * TQR-025 "Huỷ món": waiting or cooking → cancelled (the kitchen cannot make it). The guest sees
   * "Đã huỷ" live, and an open bill of the table is re-synced in the same transaction, so the
   * guest's bill page shows the new amount (or no bill when nothing is due any more).
   */
  cancel(tenant: TenantId, itemId: string, version: number): Promise<ItemChange> {
    return this.transition(
      tenant,
      itemId,
      'cancel',
      version,
      () => ({}),
      async (now, tx, item) => {
        // Same lock as bill requests and payments, so the bill cannot change under the sync.
        const [session] = await tx
          .select({ status: tableSessions.status })
          .from(tableSessions)
          .where(and(eq(tableSessions.restaurantId, tenant), eq(tableSessions.id, item.sessionId)))
          .for('update');
        // A closed session has no open bill to follow (closing superseded it).
        if (session?.status !== 'open') return;
        await syncOpenBill(tx, tenant, item.sessionId, now, { issueWhenNone: false });
      },
    );
  }

  /** "Đã ra bàn": done → served, recording who and when (AC36). */
  serve(tenant: TenantId, itemId: string, version: number, userId: string): Promise<ItemChange> {
    return this.transition(tenant, itemId, 'serve', version, (now) => ({
      servedAt: now,
      servedBy: userId,
    }));
  }

  /** AC35/AC37: the open tables with their ready dishes and progress. */
  async readyBoard(tenant: TenantId): Promise<ReadyBoard> {
    const rows = await this.db
      .select({
        id: orderItems.id,
        version: orderItems.version,
        seq: orderItems.seq,
        sessionId: orderItems.sessionId,
        tableName: diningTables.name,
        partySize: tableSessions.partySize,
        sessionOpenedAt: tableSessions.openedAt,
        name: orderItems.nameSnapshot,
        quantity: orderItems.quantity,
        note: orderItems.note,
        status: orderItems.status,
        doneAt: orderItems.doneAt,
      })
      .from(orderItems)
      .innerJoin(
        tableSessions,
        and(
          eq(tableSessions.restaurantId, orderItems.restaurantId),
          eq(tableSessions.id, orderItems.sessionId),
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
          eq(orderItems.restaurantId, tenant),
          eq(tableSessions.status, 'open'),
          ne(orderItems.status, 'cancelled'),
        ),
      );
    return buildReadyBoard(rows);
  }

  private async olderSameDish(
    tx: Tx,
    tenant: TenantId,
    item: { id: string; stationId: string; menuItemId: string },
  ) {
    const keyed = {
      id: orderItems.id,
      stationId: orderItems.stationId,
      menuItemId: orderItems.menuItemId,
      status: orderItems.status,
      queueAtUs: epochUs(orderItems.queueAt),
      sessionOpenedAtUs: epochUs(sql`${orderItems.sessionOpenedAt}`),
      seq: orderItems.seq,
      tableName: diningTables.name,
    };
    const rows = await tx
      .select(keyed)
      .from(orderItems)
      .innerJoin(
        tableSessions,
        and(
          eq(tableSessions.restaurantId, orderItems.restaurantId),
          eq(tableSessions.id, orderItems.sessionId),
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
          eq(orderItems.restaurantId, tenant),
          eq(orderItems.stationId, item.stationId),
          eq(orderItems.menuItemId, item.menuItemId),
          sql`${orderItems.queueAt} is not null`,
          inArray(orderItems.status, [...QUEUE_STATUSES]),
        ),
      );
    const target = rows.find((r) => r.id === item.id);
    return target ? findSkippedOlder(target, rows) : [];
  }

  /**
   * Compare-and-set on status + version under a row lock, then one `item.status` event per
   * audience (station, floor, the guest's session) in the same transaction (ADR 0004); `after`
   * runs last in that transaction (e.g. the bill re-sync of a cancel).
   */
  private transition(
    tenant: TenantId,
    itemId: string,
    action: ItemAction,
    version: number,
    changes: (
      now: Date,
      tx: Tx,
      item: { id: string; stationId: string; menuItemId: string },
    ) => Partial<typeof orderItems.$inferInsert> | Promise<Partial<typeof orderItems.$inferInsert>>,
    after?: (now: Date, tx: Tx, item: { sessionId: string }) => Promise<void>,
  ): Promise<ItemChange> {
    return this.db.transaction(async (tx) => {
      const [item] = await tx
        .select({
          id: orderItems.id,
          status: orderItems.status,
          version: orderItems.version,
          stationId: orderItems.stationId,
          menuItemId: orderItems.menuItemId,
          sessionId: orderItems.sessionId,
        })
        .from(orderItems)
        .where(and(eq(orderItems.restaurantId, tenant), eq(orderItems.id, itemId)))
        .for('update');
      if (!item) throw notFound();
      if (item.version !== version) throw staleVersion(item.status, item.version);
      const to = nextStatus(item.status, action);
      if (to === undefined) throw invalidTransition(item.status, item.version);
      const now = this.clock.now();
      const extra = await changes(now, tx, item);
      const [updated] = await tx
        .update(orderItems)
        .set({ ...extra, status: to, version: sql`${orderItems.version} + 1` })
        .where(
          and(
            eq(orderItems.restaurantId, tenant),
            eq(orderItems.id, itemId),
            eq(orderItems.status, item.status),
            eq(orderItems.version, version),
          ),
        )
        .returning({
          id: orderItems.id,
          status: orderItems.status,
          version: orderItems.version,
          skipReason: orderItems.skipReason,
        });
      if (!updated) throw staleVersion(item.status, item.version);
      const data = { itemId: updated.id, status: updated.status, version: updated.version };
      for (const topic of [`station:${item.stationId}`, 'floor', `session:${item.sessionId}`]) {
        await publish(tx, { restaurantId: tenant, topic, type: 'item.status', data });
      }
      if (after) await after(now, tx, item);
      return updated;
    });
  }
}
