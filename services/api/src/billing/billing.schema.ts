import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { restaurants, users } from '../db/schema.js';
import { tableSessions } from '../service/service.schema.js';

/**
 * A bill: the payable snapshot of a session's items with the code guests put in the transfer memo
 * (ADR 0006, spec glossary). Paying is compare-and-set on `status = 'open'` (AC45); a changed
 * amount supersedes the open bill with a new code (AC42).
 */
export const bills = pgTable(
  'bills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').notNull(),
    /** 5-char Crockford base32 (`domain/bill-code.ts`), unique per restaurant. */
    code: text('code').notNull(),
    amountVnd: bigint('amount_vnd', { mode: 'number' }).notNull(),
    status: text('status', { enum: ['open', 'superseded', 'paid'] })
      .notNull()
      .default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    /** Who confirmed the payment (AC44 audit); kept null if that account is later deleted. */
    paidBy: uuid('paid_by').references(() => users.id, { onDelete: 'set null' }),
    method: text('method', { enum: ['transfer', 'cash'] }),
  },
  (t) => [
    unique('bills_tenant_id_key').on(t.restaurantId, t.id),
    unique('bills_tenant_code_key').on(t.restaurantId, t.code),
    foreignKey({
      name: 'bills_session_fk',
      columns: [t.restaurantId, t.sessionId],
      foreignColumns: [tableSessions.restaurantId, tableSessions.id],
    }).onDelete('cascade'),
    // At most one payable bill per session.
    uniqueIndex('bills_one_open_per_session')
      .on(t.sessionId)
      .where(sql`${t.status} = 'open'`),
    index('bills_session_idx').on(t.restaurantId, t.sessionId, t.createdAt),
    check('bills_amount_range', sql`${t.amountVnd} between 1 and 9999999999999`),
    check('bills_code_format', sql`${t.code} ~ '^[0-9A-HJKMNP-TV-Z]{5}$'`),
    check(
      'bills_paid_fields',
      sql`(${t.status} = 'paid') = (${t.paidAt} is not null and ${t.method} is not null)`,
    ),
  ],
);
