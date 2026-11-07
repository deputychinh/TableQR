import { sql } from 'drizzle-orm';
import {
  check,
  customType,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { restaurants } from '../db/schema.js';
import { diningTables } from '../tables/tables.schema.js';
import { BOOKING_STATUSES } from './domain/booking-rules.js';

/** Postgres `tstzrange`; read through `starts_at` / `ends_at`, compared by the exclusion constraint. */
const tstzrange = customType<{ data: string; driverData: string }>({
  dataType: () => 'tstzrange',
});

/**
 * A guest's booking holding one concrete table (ADR 0007). `slot` is generated from
 * `[starts_at, ends_at)`; the migration adds
 * `EXCLUDE USING gist (table_id WITH =, slot WITH &&) WHERE (status IN ('pending','confirmed','seated'))`
 * (`bookings_no_overlap`, extension `btree_gist`) — drizzle-kit cannot express it, keep it by hand.
 */
export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    tableId: uuid('table_id').notNull(),
    partySize: integer('party_size').notNull(),
    /** Null once erased, 30 days after the slot (docs/security.md). */
    guestName: text('guest_name'),
    /** E.164 (`+84…`); null once erased. */
    guestPhone: text('guest_phone'),
    note: text('note'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    slot: tstzrange('slot').generatedAlwaysAs(sql`tstzrange("starts_at", "ends_at", '[)')`),
    status: text('status', { enum: BOOKING_STATUSES }).notNull().default('pending'),
    idempotencyKey: text('idempotency_key').notNull(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    personalDataErasedAt: timestamp('personal_data_erased_at', { withTimezone: true }),
  },
  (t) => [
    unique('bookings_tenant_id_key').on(t.restaurantId, t.id),
    foreignKey({
      name: 'bookings_table_fk',
      columns: [t.restaurantId, t.tableId],
      foreignColumns: [diningTables.restaurantId, diningTables.id],
    }).onDelete('cascade'),
    // A retried request (same Idempotency-Key) returns the same booking.
    unique('bookings_tenant_idempotency_key').on(t.restaurantId, t.idempotencyKey),
    // Staff day list.
    index('bookings_tenant_starts_idx').on(t.restaurantId, t.startsAt),
    // 5-per-phone-per-day guard.
    index('bookings_tenant_phone_created_idx').on(t.restaurantId, t.guestPhone, t.createdAt),
    // Retention job: only rows that still hold personal data.
    index('bookings_retention_idx')
      .on(t.endsAt)
      .where(sql`${t.guestPhone} is not null`),
    check('bookings_party_size_range', sql`${t.partySize} between 1 and 30`),
    check('bookings_slot_order', sql`${t.endsAt} > ${t.startsAt}`),
    check(
      'bookings_guest_name_length',
      sql`${t.guestName} is null or char_length(${t.guestName}) between 2 and 60`,
    ),
    check('bookings_note_length', sql`${t.note} is null or char_length(${t.note}) <= 140`),
    check(
      'bookings_personal_data_together',
      sql`(${t.guestName} is null) = (${t.guestPhone} is null)`,
    ),
  ],
);
