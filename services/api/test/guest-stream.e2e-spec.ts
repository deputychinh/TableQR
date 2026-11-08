import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { DB, type Database } from '../src/db/database.module.js';
import { publish } from '../src/realtime/publisher.js';
import { createTestApp, type TestApp } from './support/app.js';
import { joinPhone, line, placeOrder, setupFloor } from './support/guest-floor.js';
import { ORIGIN } from './support/http.js';
import { openSse, type SseClient } from './support/sse.js';

interface Snapshot {
  session: { id: string };
  orders: {
    id: string;
    status: string;
    items: { id: string; status: string; version: number }[];
  }[];
}

describe('guest live status stream GET /api/g/stream (e2e, AC38–AC39)', () => {
  let t: TestApp;
  let base: string;
  let db: Database;
  const clients: SseClient[] = [];

  beforeAll(async () => {
    t = await createTestApp();
    await t.app.listen(0, '127.0.0.1');
    const server = t.app.getHttpServer() as unknown as { address: () => AddressInfo };
    base = `http://127.0.0.1:${String(server.address().port)}`;
    db = t.app.get(DB);
  });

  afterEach(() => {
    for (const client of clients.splice(0)) client.close();
  });

  afterAll(async () => {
    await t.app.close();
  });

  const open = async (cookie: string) => {
    const client = await openSse(`${base}/api/g/stream`, cookie);
    clients.push(client);
    return client;
  };

  it('opens with a snapshot of the session’s orders and items', async () => {
    const floor = await setupFloor(t);
    const phone = await joinPhone(t, floor, 2);
    const placed = await placeOrder(t, phone, [line(floor.items.pho)]).expect(201);
    const client = await open(phone.cookie);
    const snapshot = (await client.waitFor((m) => m.event === 'snapshot'))
      .data as unknown as Snapshot;
    expect(snapshot.orders.map((o) => o.id)).toEqual([placed.body.id]);
    expect(snapshot.orders[0]?.items[0]).toMatchObject({ status: 'waiting', version: 1 });
  });

  it('delivers an order placed by another phone and a held order’s release as deltas', async () => {
    const floor = await setupFloor(t);
    const phone = await joinPhone(t, floor, 1);
    const other = await joinPhone(t, floor);
    const client = await open(phone.cookie);
    await client.waitFor((m) => m.event === 'snapshot');
    const held = await placeOrder(t, other, [line(floor.items.pho, 3)]).expect(201);
    const placed = await client.waitFor((m) => m.event === 'delta');
    expect(placed.data).toEqual({
      topic: `session:${(await request(t.app.getHttpServer()).get('/api/g/session').set('cookie', phone.cookie)).body.session.id as string}`,
      type: 'order.status',
      orderId: held.body.id,
      status: 'held',
    });
    await request(t.app.getHttpServer())
      .post(`/api/orders/${held.body.id as string}/confirm`)
      .set('origin', ORIGIN)
      .set('cookie', floor.ownerCookie)
      .expect(200);
    await client.waitFor((m) => m.event === 'delta' && m.data.status === 'released');
  });

  it('applies kitchen item.status events published on the session topic', async () => {
    const floor = await setupFloor(t);
    const phone = await joinPhone(t, floor, 2);
    const placed = await placeOrder(t, phone, [line(floor.items.pho)]).expect(201);
    const client = await open(phone.cookie);
    const snapshot = (await client.waitFor((m) => m.event === 'snapshot'))
      .data as unknown as Snapshot;
    const itemId = snapshot.orders[0]?.items[0]?.id ?? '';
    expect(itemId).toBe(placed.body.items[0].id);
    await publish(db, {
      restaurantId: floor.restaurantId,
      topic: `session:${snapshot.session.id}`,
      type: 'item.status',
      data: { itemId, status: 'cooking', version: 2 },
    });
    const delta = await client.waitFor((m) => m.event === 'delta');
    expect(delta.data).toMatchObject({
      type: 'item.status',
      itemId,
      status: 'cooking',
      version: 2,
    });
  });

  it('AC39: a reconnecting phone gets the current statuses in its first snapshot within 5 s', async () => {
    const floor = await setupFloor(t);
    const phone = await joinPhone(t, floor, 1);
    const first = await open(phone.cookie);
    await first.waitFor((m) => m.event === 'snapshot');
    first.close();
    // Changes while the phone is offline.
    const held = await placeOrder(t, phone, [line(floor.items.pho, 3)]).expect(201);
    await request(t.app.getHttpServer())
      .post(`/api/orders/${held.body.id as string}/reject`)
      .set('origin', ORIGIN)
      .set('cookie', floor.ownerCookie)
      .expect(200);
    const started = performance.now();
    const again = await open(phone.cookie);
    const snapshot = (await again.waitFor((m) => m.event === 'snapshot', 5000))
      .data as unknown as Snapshot;
    expect(performance.now() - started).toBeLessThan(5000);
    expect(snapshot.orders[0]).toMatchObject({ id: held.body.id, status: 'rejected' });
    expect(snapshot.orders[0]?.items.every((i) => i.status === 'cancelled')).toBe(true);
  });

  it('never sends another session’s events', async () => {
    const floor = await setupFloor(t);
    const phone = await joinPhone(t, floor, 2);
    const client = await open(phone.cookie);
    await client.waitFor((m) => m.event === 'snapshot');
    const other = await setupFloor(t);
    const otherPhone = await joinPhone(t, other, 2);
    await placeOrder(t, otherPhone, [line(other.items.tra)]).expect(201);
    const mine = await placeOrder(t, phone, [line(floor.items.tra)]).expect(201);
    await client.waitFor((m) => m.event === 'delta' && m.data.orderId === mine.body.id);
    expect(client.messages.filter((m) => m.event === 'delta')).toHaveLength(1);
  });

  it('refuses the stream without a guest cookie (401)', async () => {
    const response = await fetch(`${base}/api/g/stream`);
    expect(response.status).toBe(401);
  });

  it('TQR-016 freshness: "Xong" in the kitchen reaches 30 tables × 3 phones and 2 floor screens, p95 ≤ 2 s', async () => {
    const floor = await setupFloor(t, 8);
    const post = (path: string, body: object) =>
      request(t.app.getHttpServer())
        .post(path)
        .set('origin', ORIGIN)
        .set('cookie', floor.ownerCookie)
        .send(body);
    const tables = [{ qrToken: floor.qrToken }];
    for (let n = 2; n <= 30; n += 1) {
      tables.push(
        (await post('/api/tables', { name: `Bàn ${String(n)}`, seats: 8 }).expect(201)).body,
      );
    }
    const guests: SseClient[] = [];
    const items: { id: string; version: number }[] = [];
    for (const table of tables) {
      const first = await joinPhone(t, { ...floor, qrToken: table.qrToken }, 2);
      const phones = [
        first,
        await joinPhone(t, { ...floor, qrToken: table.qrToken }),
        await joinPhone(t, { ...floor, qrToken: table.qrToken }),
      ];
      for (const phone of phones) {
        const client = await open(phone.cookie);
        await client.waitFor((m) => m.event === 'snapshot');
        guests.push(client);
      }
      const placed = await placeOrder(t, first, [line(floor.items.pho)]).expect(201);
      items.push({ id: placed.body.items[0].id as string, version: 1 });
    }
    const screens: SseClient[] = [];
    for (let n = 0; n < 2; n += 1) {
      const client = await openSse(`${base}/api/stream/floor`, floor.ownerCookie);
      clients.push(client);
      await client.waitFor((m) => m.event === 'snapshot');
      screens.push(client);
    }
    const sentAt = new Map<string, number>();
    // The cook works the queue in order (no skips): start, then "Xong".
    for (const item of items) {
      await post(`/api/kitchen/items/${item.id}/start`, { version: 1 }).expect(200);
      sentAt.set(item.id, performance.now());
      await post(`/api/kitchen/items/${item.id}/done`, { version: 2 }).expect(200);
    }
    const isDone = (m: { event: string; data: Record<string, unknown> }) =>
      m.event === 'delta' && m.data.type === 'item.status' && m.data.status === 'done';
    const delays: number[] = [];
    for (const client of [...guests, ...screens]) {
      const expected = screens.includes(client) ? items.length : 1;
      await expect
        .poll(() => client.messages.filter(isDone).length, { timeout: 10_000 })
        .toBeGreaterThanOrEqual(expected);
      for (const m of client.messages.filter(isDone)) {
        delays.push(m.at - (sentAt.get(m.data.itemId as string) ?? Infinity));
      }
    }
    delays.sort((x, y) => x - y);
    const p95 = delays[Math.floor(delays.length * 0.95)] ?? Infinity;
    process.stdout.write(
      `guest freshness: ${String(delays.length)} deliveries, p95 ${p95.toFixed(1)} ms\n`,
    );
    expect(delays).toHaveLength(30 * 3 + 2 * 30);
    expect(p95).toBeLessThan(2000);
  }, 60_000);
});
