import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const restaurants = pgTable(
  'restaurants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    status: text('status', { enum: ['active', 'suspended'] })
      .notNull()
      .default('active'),
    rules: jsonb('rules')
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** Version of `rules` (AC12); null = defaults since sign-up. */
    rulesUpdatedAt: timestamp('rules_updated_at', { withTimezone: true }),
    /** VietQR receiving account (ADR 0006); all three null = pay at the counter (AC41). */
    bankBin: text('bank_bin'),
    bankAccount: text('bank_account'),
    bankAccountName: text('bank_account_name'),
    bankChangedAt: timestamp('bank_changed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      'restaurants_bank_all_or_none',
      sql`(${t.bankBin} is null) = (${t.bankAccount} is null) and (${t.bankAccount} is null) = (${t.bankAccountName} is null)`,
    ),
  ],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    restaurantId: uuid('restaurant_id').references(() => restaurants.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role', {
      enum: ['owner', 'cashier', 'waiter', 'kitchen', 'platform_admin'],
    }).notNull(),
    displayName: text('display_name').notNull().default(''),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('users_email_key').on(t.email)],
);

export const authSessions = pgTable(
  'auth_sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    restaurantId: uuid('restaurant_id'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('auth_sessions_user_idx').on(t.userId)],
);

export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    attemptedAt: timestamp('attempted_at', { withTimezone: true }).notNull(),
    succeeded: boolean('succeeded').notNull(),
  },
  (t) => [index('login_attempts_email_time_idx').on(t.email, t.attemptedAt)],
);

export * from '../menu/menu.schema.js';
export * from '../tables/tables.schema.js';
export * from '../service/service.schema.js';
export * from '../booking/booking.schema.js';
