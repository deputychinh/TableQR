import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { DB, type Database } from '../src/db/database.module.js';
import { RealtimeHub } from '../src/realtime/realtime.hub.js';
import { publish } from '../src/realtime/publisher.js';
import { createTestApp, type TestApp } from './support/app.js';
import { signUp } from './support/http.js';
import { openSse, type SseClient } from './support/sse.js';

describe('realtime hub and floor stream (e2e, real Postgres)', () => {
  let t: TestApp;
  let base: string;
  let db: Database;
  let hub: RealtimeHub;
  const clients: SseClient[] = [];

  const restaurantOf = async (cookie: string): Promise<string> =>
    (await request(t.app.getHttpServer()).get('/api/me').set('cookie', cookie)).body.restaurant
      .id as string;

  beforeAll(async () => {
    t = await createTestApp();
    await t.app.listen(0, '127.0.0.1');
    const server = t.app.getHttpServer() as unknown as { address: () => AddressInfo };
    base = `http://127.0.0.1:${server.address().port}`;
    db = t.app.get(DB);
    hub = t.app.get(RealtimeHub);
  });

  afterEach(() => {
    for (const client of clients.splice(0)) client.close();
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('opens with a snapshot and delivers a committed event as a delta', async () => {
    const owner = await signUp(t);
    const restaurantId = await restaurantOf(owner.cookie);
    const client = await openSse(`${base}/api/stream/floor`, owner.cookie);
    clients.push(client);
    await client.waitFor((m) => m.event === 'snapshot');
    await db.transaction((tx) =>
      publish(tx, {
        restaurantId,
        topic: 'floor',
        type: 'item.status',
        data: { itemId: 'i1', status: 'done', version: 2 },
      }),
    );
    const delta = await client.waitFor((m) => m.event === 'delta');
    expect(delta.data).toEqual({
      topic: 'floor',
      type: 'item.status',
      itemId: 'i1',
      status: 'done',
      version: 2,
    });
  });

  it('never delivers an event from a rolled-back transaction', async () => {
    const owner = await signUp(t);
    const restaurantId = await restaurantOf(owner.cookie);
    const client = await openSse(`${base}/api/stream/floor`, owner.cookie);
    clients.push(client);
    await client.waitFor((m) => m.event === 'snapshot');
    await db
      .transaction(async (tx) => {
        await publish(tx, { restaurantId, topic: 'floor', type: 'ghost', data: {} });
        throw new Error('rollback');
      })
      .catch(() => undefined);
    await publish(db, { restaurantId, topic: 'floor', type: 'real', data: {} });
    await client.waitFor((m) => m.event === 'delta' && m.data.type === 'real');
    expect(client.messages.some((m) => m.data.type === 'ghost')).toBe(false);
  });

  it('keeps restaurants apart: B never sees A’s events', async () => {
    const a = await signUp(t);
    const b = await signUp(t);
    const restaurantA = await restaurantOf(a.cookie);
    const restaurantB = await restaurantOf(b.cookie);
    const clientB = await openSse(`${base}/api/stream/floor`, b.cookie);
    clients.push(clientB);
    await clientB.waitFor((m) => m.event === 'snapshot');
    await publish(db, { restaurantId: restaurantA, topic: 'floor', type: 'for-a', data: {} });
    await publish(db, { restaurantId: restaurantB, topic: 'floor', type: 'for-b', data: {} });
    await clientB.waitFor((m) => m.data.type === 'for-b');
    expect(clientB.messages.some((m) => m.data.type === 'for-a')).toBe(false);
  });

  it('refuses the stream without a session (401)', async () => {
    await request(t.app.getHttpServer()).get('/api/stream/floor').expect(401);
  });

  it('sends resync and a fresh snapshot after the LISTEN connection drops', async () => {
    const owner = await signUp(t);
    const restaurantId = await restaurantOf(owner.cookie);
    const client = await openSse(`${base}/api/stream/floor`, owner.cookie);
    clients.push(client);
    await client.waitFor((m) => m.event === 'snapshot');
    await hub.simulateDisconnect();
    await client.waitFor((m) => m.event === 'resync', 15_000);
    await client.waitFor((m) => m.event === 'snapshot' && client.messages.indexOf(m) > 0, 5000);
    await publish(db, { restaurantId, topic: 'floor', type: 'after-reconnect', data: {} });
    await client.waitFor((m) => m.data.type === 'after-reconnect');
  }, 30_000);

  it('unsubscribes when the client goes away', async () => {
    const owner = await signUp(t);
    const before = hub.subscriberCount;
    const client = await openSse(`${base}/api/stream/floor`, owner.cookie);
    await client.waitFor((m) => m.event === 'snapshot');
    expect(hub.subscriberCount).toBe(before + 1);
    client.close();
    await expect.poll(() => hub.subscriberCount, { timeout: 3000 }).toBe(before);
  });

  it('spike: 300 streams receive 50 events/s with p95 delay under 2 s', async () => {
    const owner = await signUp(t);
    const restaurantId = await restaurantOf(owner.cookie);
    // Open in batches: macOS caps the listen backlog at 128 pending connections.
    const streams: SseClient[] = [];
    for (let batch = 0; batch < 6; batch += 1) {
      streams.push(
        ...(await Promise.all(
          Array.from({ length: 50 }, () => openSse(`${base}/api/stream/floor`, owner.cookie)),
        )),
      );
    }
    clients.push(...streams);
    await Promise.all(streams.map((s) => s.waitFor((m) => m.event === 'snapshot', 15_000)));
    const sentAt = new Map<number, number>();
    for (let i = 0; i < 100; i += 1) {
      sentAt.set(i, performance.now());
      await publish(db, { restaurantId, topic: 'floor', type: 'spike', data: { n: i } });
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await Promise.all(
      streams.map((s) => s.waitFor((m) => m.data.type === 'spike' && m.data.n === 99, 15_000)),
    );
    const delays = streams
      .flatMap((s) => s.messages.filter((m) => m.data.type === 'spike'))
      .map((m) => m.at - (sentAt.get(m.data.n as number) ?? 0))
      .sort((x, y) => x - y);
    const p95 = delays[Math.floor(delays.length * 0.95)] ?? Infinity;
    console.info(`realtime spike: ${delays.length} deliveries, p95 ${p95.toFixed(1)} ms`);
    expect(delays).toHaveLength(300 * 100);
    expect(p95).toBeLessThan(2000);
  }, 60_000);
});
