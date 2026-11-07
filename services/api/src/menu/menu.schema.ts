import { sql } from 'drizzle-orm';
import {
  boolean,
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
import { MAX_LATE_MINUTES, MIN_LATE_MINUTES } from './domain/station.js';
import { MAX_PRICE_VND, MIN_PRICE_VND } from './domain/price.js';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const restaurantId = () =>
  uuid('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' });

/** Kitchen areas (bếp nóng, bếp lạnh, quầy bar); each will have its own queue (TQR-014). */
export const stations = pgTable(
  'stations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    restaurantId: restaurantId(),
    name: text('name').notNull(),
    lateAfterMinutes: integer('late_after_minutes').notNull().default(15),
    createdAt: createdAt(),
  },
  (t) => [
    unique('stations_tenant_id_key').on(t.restaurantId, t.id),
    uniqueIndex('stations_tenant_name_key').on(t.restaurantId, sql`lower(${t.name})`),
    check(
      'stations_late_after_minutes_check',
      sql`${t.lateAfterMinutes} between ${sql.raw(String(MIN_LATE_MINUTES))} and ${sql.raw(String(MAX_LATE_MINUTES))}`,
    ),
  ],
);

/** Menu sections in the owner's order; `is_main` marks "món chính" for the anomaly rule (S8). */
export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    restaurantId: restaurantId(),
    name: text('name').notNull(),
    isMain: boolean('is_main').notNull().default(false),
    sortOrder: integer('sort_order').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('categories_tenant_id_key').on(t.restaurantId, t.id),
    uniqueIndex('categories_tenant_name_key').on(t.restaurantId, sql`lower(${t.name})`),
    index('categories_tenant_sort_idx').on(t.restaurantId, t.sortOrder),
  ],
);

/** Dishes; parents are referenced with (restaurant_id, id) so a row can never cross tenants (ADR 0003). */
export const menuItems = pgTable(
  'menu_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    restaurantId: restaurantId(),
    categoryId: uuid('category_id').notNull(),
    stationId: uuid('station_id').notNull(),
    name: text('name').notNull(),
    priceVnd: integer('price_vnd').notNull(),
    description: text('description'),
    available: boolean('available').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('menu_items_tenant_id_key').on(t.restaurantId, t.id),
    foreignKey({
      name: 'menu_items_category_fk',
      columns: [t.restaurantId, t.categoryId],
      foreignColumns: [categories.restaurantId, categories.id],
    }).onDelete('no action'),
    foreignKey({
      name: 'menu_items_station_fk',
      columns: [t.restaurantId, t.stationId],
      foreignColumns: [stations.restaurantId, stations.id],
    }).onDelete('no action'),
    index('menu_items_tenant_category_idx').on(t.restaurantId, t.categoryId),
    index('menu_items_tenant_station_idx').on(t.restaurantId, t.stationId),
    check(
      'menu_items_price_vnd_check',
      sql`${t.priceVnd} between ${sql.raw(String(MIN_PRICE_VND))} and ${sql.raw(String(MAX_PRICE_VND))}`,
    ),
  ],
);
