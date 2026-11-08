import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { restaurants } from '../db/schema.js';

/** A restaurant's table; `qr_token` is what its printed QR code carries (AC8). */
export const diningTables = pgTable(
  'dining_tables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    seats: integer('seats').notNull(),
    qrToken: text('qr_token').notNull(),
    qrRotatedAt: timestamp('qr_rotated_at', { withTimezone: true }),
    /** TQR-024 "Ẩn bàn": hidden from lists, printing and guests; its history stays. */
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Composite key so child rows (sessions, bookings, retired tokens) cannot cross tenants.
    unique('dining_tables_tenant_id_key').on(t.restaurantId, t.id),
    uniqueIndex('dining_tables_qr_token_key').on(t.qrToken),
    // Names are unique per restaurant regardless of letter case ("Bàn 1" = "bàn 1").
    uniqueIndex('dining_tables_tenant_name_key').on(t.restaurantId, sql`lower(${t.name})`),
    index('dining_tables_tenant_created_idx').on(t.restaurantId, t.createdAt),
    check('dining_tables_seats_range', sql`${t.seats} between 1 and 30`),
    check('dining_tables_name_length', sql`char_length(${t.name}) between 1 and 30`),
  ],
);

/** Tokens replaced by a rotation (AC10): the guest endpoint answers "expired", not "unknown". */
export const retiredQrTokens = pgTable(
  'retired_qr_tokens',
  {
    qrToken: text('qr_token').primaryKey(),
    restaurantId: uuid('restaurant_id').notNull(),
    tableId: uuid('table_id').notNull(),
    retiredAt: timestamp('retired_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    foreignKey({
      name: 'retired_qr_tokens_table_fk',
      columns: [t.restaurantId, t.tableId],
      foreignColumns: [diningTables.restaurantId, diningTables.id],
    }).onDelete('cascade'),
    index('retired_qr_tokens_table_idx').on(t.restaurantId, t.tableId),
  ],
);
