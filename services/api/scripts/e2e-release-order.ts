// Browser e2e fixture (web/e2e/kitchen.spec.ts): puts a released order straight into the database,
// so the kitchen and waiter journeys do not depend on the guest ordering flow. Never used by the app.
//
//   node scripts/e2e-release-order.ts '{"restaurantId":"…","tableName":"Bàn 1","minutesAgo":20,
//     "items":[{"menuItemName":"Phở bò","quantity":2,"note":"Không hành"}]}'
//
// Opens the table's session if needed, writes the order and its items as `waiting` with
// `queue_at = now() - minutesAgo`, and publishes `item.status` on each station topic, as the ordering
// flow does on release (ADR 0004/0005). Prints the new item ids as JSON.
import pg from 'pg';
import { z } from 'zod';

const DEFAULT_DATABASE_URL = 'postgresql://tableqr:tableqr@127.0.0.1:55432/tableqr';

const inputSchema = z.object({
  restaurantId: z.uuid(),
  tableName: z.string().min(1),
  partySize: z.number().int().min(1).max(34).default(2),
  minutesAgo: z.number().min(0).default(0),
  items: z
    .array(
      z.object({
        menuItemName: z.string().min(1),
        quantity: z.number().int().min(1).max(20).default(1),
        note: z.string().max(140).optional(),
      }),
    )
    .min(1),
});

const main = async (): Promise<void> => {
  const input = inputSchema.parse(JSON.parse(process.argv[2] ?? '{}'));
  const client = new pg.Client({
    connectionString: process.env.TQR_DATABASE_URL ?? DEFAULT_DATABASE_URL,
  });
  await client.connect();
  try {
    await client.query('begin');
    const table = await client.query<{ id: string }>(
      'select id from dining_tables where restaurant_id = $1 and name = $2',
      [input.restaurantId, input.tableName],
    );
    const tableId = table.rows[0]?.id;
    if (!tableId) throw new Error(`no table ${input.tableName}`);
    const open = await client.query<{ id: string; opened_at: Date }>(
      `select id, opened_at from table_sessions
       where restaurant_id = $1 and table_id = $2 and status = 'open'`,
      [input.restaurantId, tableId],
    );
    const session =
      open.rows[0] ??
      (
        await client.query<{ id: string; opened_at: Date }>(
          `insert into table_sessions (restaurant_id, table_id, party_size, opened_by)
           values ($1, $2, $3, 'staff') returning id, opened_at`,
          [input.restaurantId, tableId, input.partySize],
        )
      ).rows[0];
    if (!session) throw new Error('no session');
    const order = await client.query<{ id: string }>(
      `insert into orders (restaurant_id, session_id, idempotency_key, status, placed_by,
         requested_at, released_at, total_vnd, rules_snapshot)
       values ($1, $2, gen_random_uuid()::text, 'released', 'guest',
         now() - make_interval(secs => $3), now() - make_interval(secs => $3), 0, '{}')
       returning id`,
      [input.restaurantId, session.id, input.minutesAgo * 60],
    );
    const orderId = order.rows[0]?.id;
    const ids: string[] = [];
    for (const line of input.items) {
      const item = await client.query<{ id: string; station_id: string; version: number }>(
        `insert into order_items (restaurant_id, order_id, session_id, menu_item_id, station_id,
           name_snapshot, price_vnd, is_main, quantity, note, status, queue_at, session_opened_at)
         select m.restaurant_id, $2, $3, m.id, m.station_id, m.name, m.price_vnd,
           case when c.is_main then 'yes' else 'no' end, $5, $6, 'waiting',
           now() - make_interval(secs => $7), $8
         from menu_items m join categories c on c.id = m.category_id
         where m.restaurant_id = $1 and m.name = $4
         returning id, station_id, version`,
        [
          input.restaurantId,
          orderId,
          session.id,
          line.menuItemName,
          line.quantity,
          line.note ?? null,
          input.minutesAgo * 60,
          session.opened_at,
        ],
      );
      const row = item.rows[0];
      if (!row) throw new Error(`no menu item ${line.menuItemName}`);
      ids.push(row.id);
      await client.query('select pg_notify($1, $2)', [
        'tqr',
        JSON.stringify({
          restaurantId: input.restaurantId,
          topic: `station:${row.station_id}`,
          type: 'item.status',
          data: { itemId: row.id, status: 'waiting', version: row.version },
        }),
      ]);
    }
    await client.query('commit');
    process.stdout.write(`${JSON.stringify(ids)}\n`);
  } catch (error: unknown) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
};

await main();
