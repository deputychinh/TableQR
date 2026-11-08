import { sql } from 'drizzle-orm';
import type { Database } from '../../src/db/database.module.js';

/**
 * Every row of one restaurant, as JSON text per table (TQR-017): the restaurant row itself and
 * each table with a `restaurant_id` column, found in the catalogue so a new table is included
 * without editing this list. Two snapshots are equal only if nothing of the tenant changed.
 */
export const tenantSnapshot = async (
  db: Database,
  restaurantId: string,
): Promise<Record<string, string[]>> => {
  const tables = await db.execute<{ table_name: string }>(sql`
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'restaurant_id'
    order by table_name`);
  const snapshot: Record<string, string[]> = {};
  const restaurant = await db.execute<{ row: string }>(
    sql`select row_to_json(r)::text as row from restaurants r where r.id = ${restaurantId}`,
  );
  snapshot.restaurants = restaurant.rows.map((r) => r.row);
  for (const { table_name: name } of tables.rows) {
    const rows = await db.execute<{ row: string }>(sql`
      select row_to_json(t)::text as row from ${sql.identifier(name)} t
      where t.restaurant_id = ${restaurantId} order by 1`);
    snapshot[name] = rows.rows.map((r) => r.row);
  }
  return snapshot;
};
