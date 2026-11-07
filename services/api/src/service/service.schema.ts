import { sql } from 'drizzle-orm';
import {
  bigserial,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { restaurants, users } from '../db/schema.js';
import { diningTables } from '../tables/tables.schema.js';
import { menuItems, stations } from '../menu/menu.schema.js';

/**
 * Service-floor data (design.md "Data", ADR 0003/0005). Shared contract for TQR-011…019:
 * agents build services on these tables and must not change their meaning without telling the lead.
 */

/** One party's visit at a table: opened at arrival, closed after payment (glossary "table session"). */
export const tableSessions = pgTable(
  'table_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    tableId: uuid('table_id').notNull(),
    partySize: integer('party_size').notNull(),
    status: text('status', { enum: ['open', 'closed'] })
      .notNull()
      .default('open'),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    openedBy: text('opened_by', { enum: ['guest', 'staff', 'booking'] }).notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closeReason: text('close_reason'),
    bookingId: uuid('booking_id'),
  },
  (t) => [
    unique('table_sessions_tenant_id_key').on(t.restaurantId, t.id),
    foreignKey({
      name: 'table_sessions_table_fk',
      columns: [t.restaurantId, t.tableId],
      foreignColumns: [diningTables.restaurantId, diningTables.id],
    }).onDelete('cascade'),
    // AC17/AC18: at most one open session per table.
    uniqueIndex('table_sessions_one_open_per_table')
      .on(t.tableId)
      .where(sql`${t.status} = 'open'`),
    index('table_sessions_tenant_status_idx').on(t.restaurantId, t.status),
    check('table_sessions_party_size_range', sql`${t.partySize} between 1 and 34`),
  ],
);

/** A guest phone joined to one session; only the cookie's SHA-256 is stored (ADR 0002 §3). */
export const guestDevices = pgTable(
  'guest_devices',
  {
    tokenHash: text('token_hash').primaryKey(),
    restaurantId: uuid('restaurant_id').notNull(),
    sessionId: uuid('session_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'guest_devices_session_fk',
      columns: [t.restaurantId, t.sessionId],
      foreignColumns: [tableSessions.restaurantId, tableSessions.id],
    }).onDelete('cascade'),
    index('guest_devices_session_idx').on(t.sessionId),
  ],
);

/** One cart submission inside a session. */
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    restaurantId: uuid('restaurant_id').notNull(),
    sessionId: uuid('session_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    status: text('status', {
      enum: ['held', 'awaiting_payment', 'released', 'rejected', 'cancelled'],
    }).notNull(),
    /** Why it is held: `anomaly_over`, `every_order` (AC26/AC29). */
    holdReason: text('hold_reason'),
    /** AC27 flag for the waiter, not a hold. */
    flag: text('flag'),
    placedBy: text('placed_by', { enum: ['guest', 'staff'] }).notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    totalVnd: integer('total_vnd').notNull(),
    /** House rules in force when the order was placed (AC12, TQR-008 `snapshotRules`). */
    rulesSnapshot: jsonb('rules_snapshot').notNull(),
  },
  (t) => [
    unique('orders_tenant_id_key').on(t.restaurantId, t.id),
    foreignKey({
      name: 'orders_session_fk',
      columns: [t.restaurantId, t.sessionId],
      foreignColumns: [tableSessions.restaurantId, tableSessions.id],
    }).onDelete('cascade'),
    // AC24: a retried submission returns the same order.
    unique('orders_session_idempotency_key').on(t.sessionId, t.idempotencyKey),
    index('orders_tenant_status_idx').on(t.restaurantId, t.status),
    check('orders_total_non_negative', sql`${t.totalVnd} >= 0`),
  ],
);

/** One dish line; carries its own queue position (ADR 0005). */
export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Tie-breaker in creation order (ADR 0005 uses it after queue_at and session_opened_at). */
    seq: bigserial('seq', { mode: 'number' }).notNull(),
    restaurantId: uuid('restaurant_id').notNull(),
    orderId: uuid('order_id').notNull(),
    sessionId: uuid('session_id').notNull(),
    menuItemId: uuid('menu_item_id').notNull(),
    stationId: uuid('station_id').notNull(),
    nameSnapshot: text('name_snapshot').notNull(),
    priceVnd: integer('price_vnd').notNull(),
    isMain: text('is_main', { enum: ['yes', 'no'] }).notNull(),
    quantity: integer('quantity').notNull(),
    note: text('note'),
    status: text('status', {
      enum: ['pending', 'waiting', 'cooking', 'done', 'served', 'cancelled'],
    }).notNull(),
    /** Null until released to the kitchen; then the order's queue time (ADR 0005). */
    queueAt: timestamp('queue_at', { withTimezone: true }),
    sessionOpenedAt: timestamp('session_opened_at', { withTimezone: true }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    doneAt: timestamp('done_at', { withTimezone: true }),
    servedAt: timestamp('served_at', { withTimezone: true }),
    servedBy: uuid('served_by').references(() => users.id, { onDelete: 'set null' }),
    skipReason: text('skip_reason'),
    version: integer('version').notNull().default(1),
  },
  (t) => [
    unique('order_items_tenant_id_key').on(t.restaurantId, t.id),
    foreignKey({
      name: 'order_items_order_fk',
      columns: [t.restaurantId, t.orderId],
      foreignColumns: [orders.restaurantId, orders.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'order_items_menu_item_fk',
      columns: [t.restaurantId, t.menuItemId],
      foreignColumns: [menuItems.restaurantId, menuItems.id],
    }),
    foreignKey({
      name: 'order_items_station_fk',
      columns: [t.restaurantId, t.stationId],
      foreignColumns: [stations.restaurantId, stations.id],
    }),
    // Station queue (design.md): waiting/cooking items of a station in queue order.
    index('order_items_station_queue_idx').on(
      t.restaurantId,
      t.stationId,
      t.status,
      t.queueAt,
      t.sessionOpenedAt,
      t.seq,
    ),
    index('order_items_session_idx').on(t.sessionId),
    check('order_items_quantity_range', sql`${t.quantity} between 1 and 20`),
    check('order_items_note_length', sql`${t.note} is null or char_length(${t.note}) <= 140`),
    check('order_items_price_positive', sql`${t.priceVnd} > 0`),
  ],
);
