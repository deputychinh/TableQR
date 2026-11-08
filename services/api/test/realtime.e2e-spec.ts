import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { DB, type Database } from '../src/db/database.module.js';
import { RealtimeHub } from '../src/realtime/realtime.hub.js';
import { publish } from '../src/realtime/publisher.js';
import { sql } from 'drizzle-orm';
import { createTestApp, type TestApp } from './support/app.js';
import { ORIGIN, signUp } from './support/http.js';
import { openSse, type SseClient } from './support/sse.js';
import { openSession, seedMenu } from './support/floor.js';
import { STAFF_PASSWORD, addStaff, loginCookie, platformAdminCookie } from './support/staff.js';

/** Fails when the server has not ended the stream within `ms`. */
const endsWithin = (client: SseClient, ms: number) =>
  Promise.race([
    client.ended,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`stream still open after ${ms} ms`)), ms),
    ),
  ]);

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

  const waiterStream = async () => {
    const owner = await signUp(t);
    const { body, member } = await addStaff(t, owner.cookie, 'waiter');
    const cookie = await loginCookie(t, body.email, STAFF_PASSWORD);
    const client = await openSse(`${base}/api/stream/floor`, cookie);
    clients.push(client);
    await client.waitFor((m) => m.event === 'snapshot');
    return { owner, member, client };
  };

  it('D4 ends a waiter’s open stream within seconds when the owner disables them', async () => {
    const { owner, member, client } = await waiterStream();
    await request(t.app.getHttpServer())
      .patch(`/api/staff/${member.id}`)
      .set('origin', ORIGIN)
      .set('cookie', owner.cookie)
      .send({ active: false })
      .expect(200);
    await endsWithin(client, 3000);
    expect(client.messages.some((m) => m.event === 'revoked')).toBe(true);
  });

  it('D4 ends a waiter’s open stream when the owner sets a new password', async () => {
    const { owner, member, client } = await waiterStream();
    await request(t.app.getHttpServer())
      .put(`/api/staff/${member.id}/password`)
      .set('origin', ORIGIN)
      .set('cookie', owner.cookie)
      .send({ password: 'mat-khau-moi-12345' })
      .expect(204);
    await endsWithin(client, 3000);
  });

  it('D4 ends every stream of a restaurant when the platform admin suspends it', async () => {
    const { owner, client } = await waiterStream();
    const restaurantId = await restaurantOf(owner.cookie);
    const ownerClient = await openSse(`${base}/api/stream/floor`, owner.cookie);
    clients.push(ownerClient);
    await ownerClient.waitFor((m) => m.event === 'snapshot');
    const other = await signUp(t);
    const otherClient = await openSse(`${base}/api/stream/floor`, other.cookie);
    clients.push(otherClient);
    await otherClient.waitFor((m) => m.event === 'snapshot');
    const admin = await platformAdminCookie(t);
    await request(t.app.getHttpServer())
      .post(`/api/admin/restaurants/${restaurantId}/suspend`)
      .set('origin', ORIGIN)
      .set('cookie', admin.cookie)
      .expect(200);
    await Promise.all([endsWithin(client, 3000), endsWithin(ownerClient, 3000)]);
    // Another restaurant's stream stays open.
    const otherId = await restaurantOf(other.cookie);
    await publish(db, { restaurantId: otherId, topic: 'floor', type: 'still-here', data: {} });
    await otherClient.waitFor((m) => m.data.type === 'still-here');
  });

  it('D4 also ends the kitchen station, guest order and guest bill streams on suspension', async () => {
    const owner = await signUp(t);
    const restaurantId = await restaurantOf(owner.cookie);
    const floor = await seedMenu(db, restaurantId);
    const session = await openSession(db, floor);
    const cook = await addStaff(t, owner.cookie, 'kitchen');
    const cookCookie = await loginCookie(t, cook.body.email, STAFF_PASSWORD);
    const streams = await Promise.all([
      openSse(`${base}/api/stream/station/${floor.stationId}`, cookCookie),
      openSse(`${base}/api/g/stream`, session.guestCookie),
      openSse(`${base}/api/g/bill/stream`, session.guestCookie),
    ]);
    clients.push(...streams);
    await Promise.all(streams.map((c) => c.waitFor((m) => m.event === 'snapshot')));
    const admin = await platformAdminCookie(t);
    await request(t.app.getHttpServer())
      .post(`/api/admin/restaurants/${restaurantId}/suspend`)
      .set('origin', ORIGIN)
      .set('cookie', admin.cookie)
      .expect(200);
    await Promise.all(streams.map((c) => endsWithin(c, 3000)));
  });

  it('D4 ends a cook’s station stream when the owner disables them', async () => {
    const owner = await signUp(t);
    const floor = await seedMenu(db, await restaurantOf(owner.cookie));
    const cook = await addStaff(t, owner.cookie, 'kitchen');
    const cookCookie = await loginCookie(t, cook.body.email, STAFF_PASSWORD);
    const client = await openSse(`${base}/api/stream/station/${floor.stationId}`, cookCookie);
    clients.push(client);
    await client.waitFor((m) => m.event === 'snapshot');
    await request(t.app.getHttpServer())
      .patch(`/api/staff/${cook.member.id}`)
      .set('origin', ORIGIN)
      .set('cookie', owner.cookie)
      .send({ active: false })
      .expect(200);
    await endsWithin(client, 3000);
  });

  it('refuses the floor stream to kitchen and platform admin (403)', async () => {
    const owner = await signUp(t);
    const { body } = await addStaff(t, owner.cookie, 'kitchen');
    const kitchen = await loginCookie(t, body.email, STAFF_PASSWORD);
    const admin = await platformAdminCookie(t);
    for (const cookie of [kitchen, admin.cookie]) {
      const response = await request(t.app.getHttpServer())
        .get('/api/stream/floor')
        .set('cookie', cookie)
        .expect(403);
      expect(response.body.code).toBe('FORBIDDEN');
    }
  });

  it('drops a malformed NOTIFY payload and logs it without its content', async () => {
    t.logs.length = 0;
    await db.execute(sql`select pg_notify('tqr', 'secret-not-json-0901234567')`);
    await expect
      .poll(() => t.logs.some((l) => l.msg === 'realtime_payload_dropped'), { timeout: 3000 })
      .toBe(true);
    expect(JSON.stringify(t.logs)).not.toContain('0901234567');
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

describe('stream caps and the heartbeat session check (e2e)', () => {
  let t: TestApp;
  let base: string;
  const clients: SseClient[] = [];
  const saved = {
    perUser: process.env.TQR_STREAMS_PER_USER,
    perRestaurant: process.env.TQR_STREAMS_PER_RESTAURANT,
    heartbeat: process.env.TQR_SSE_HEARTBEAT_MS,
    perGuestSession: process.env.TQR_STREAMS_PER_GUEST_SESSION,
    guestPool: process.env.TQR_GUEST_STREAMS_PER_RESTAURANT,
  };

  beforeAll(async () => {
    process.env.TQR_STREAMS_PER_USER = '2';
    process.env.TQR_STREAMS_PER_RESTAURANT = '3';
    process.env.TQR_SSE_HEARTBEAT_MS = '200';
    process.env.TQR_STREAMS_PER_GUEST_SESSION = '2';
    process.env.TQR_GUEST_STREAMS_PER_RESTAURANT = '3';
    t = await createTestApp();
    await t.app.listen(0, '127.0.0.1');
    const server = t.app.getHttpServer() as unknown as { address: () => AddressInfo };
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(() => {
    for (const client of clients.splice(0)) client.close();
  });

  afterAll(async () => {
    process.env.TQR_STREAMS_PER_USER = saved.perUser;
    process.env.TQR_STREAMS_PER_RESTAURANT = saved.perRestaurant;
    process.env.TQR_SSE_HEARTBEAT_MS = saved.heartbeat;
    process.env.TQR_STREAMS_PER_GUEST_SESSION = saved.perGuestSession;
    process.env.TQR_GUEST_STREAMS_PER_RESTAURANT = saved.guestPool;
    await t.app.close();
  });

  const open = async (cookie: string) => {
    const client = await openSse(`${base}/api/stream/floor`, cookie);
    clients.push(client);
    await client.waitFor((m) => m.event === 'snapshot');
    return client;
  };
  const statusOf = async (cookie: string) => {
    const response = await fetch(`${base}/api/stream/floor`, { headers: { cookie } });
    const status = response.status;
    if (status === 429) {
      expect(((await response.json()) as { code: string }).code).toBe('TOO_MANY_STREAMS');
    } else {
      await response.body?.cancel();
    }
    return status;
  };

  it('caps streams per staff member and per restaurant with 429 TOO_MANY_STREAMS', async () => {
    const owner = await signUp(t);
    const waiter = await addStaff(t, owner.cookie, 'waiter');
    const cashier = await addStaff(t, owner.cookie, 'cashier');
    const waiterCookie = await loginCookie(t, waiter.body.email, STAFF_PASSWORD);
    const cashierCookie = await loginCookie(t, cashier.body.email, STAFF_PASSWORD);
    const first = await open(owner.cookie);
    await open(owner.cookie);
    expect(await statusOf(owner.cookie)).toBe(429);
    await open(waiterCookie);
    expect(await statusOf(cashierCookie)).toBe(429);
    first.close();
    await expect.poll(() => statusOf(cashierCookie), { timeout: 3000 }).toBe(200);
  });

  it('closes a stream at the next heartbeat once its session is gone (backstop)', async () => {
    const owner = await signUp(t);
    const client = await open(owner.cookie);
    await request(t.app.getHttpServer())
      .post('/api/auth/logout')
      .set('origin', ORIGIN)
      .set('cookie', owner.cookie)
      .expect(204);
    await endsWithin(client, 2000);
  });

  it('caps the guest streams of one table session with 429 TOO_MANY_STREAMS', async () => {
    const owner = await signUp(t);
    const restaurantId = (
      await request(t.app.getHttpServer()).get('/api/me').set('cookie', owner.cookie)
    ).body.restaurant.id as string;
    const floor = await seedMenu(t.app.get(DB), restaurantId);
    const session = await openSession(t.app.get(DB), floor);
    for (const path of ['/api/g/stream', '/api/g/bill/stream']) {
      const client = await openSse(`${base}${path}`, session.guestCookie);
      clients.push(client);
      await client.waitFor((m) => m.event === 'snapshot');
    }
    const response = await fetch(`${base}/api/g/stream`, {
      headers: { cookie: session.guestCookie },
    });
    expect(response.status).toBe(429);
    expect(((await response.json()) as { code: string }).code).toBe('TOO_MANY_STREAMS');
  });

  it('guests and staff draw from separate per-restaurant pools: a full guest pool never blocks the staff screens', async () => {
    const owner = await signUp(t);
    const restaurantId = (
      await request(t.app.getHttpServer()).get('/api/me').set('cookie', owner.cookie)
    ).body.restaurant.id as string;
    const waiter = await addStaff(t, owner.cookie, 'waiter');
    const cashier = await addStaff(t, owner.cookie, 'cashier');
    const waiterCookie = await loginCookie(t, waiter.body.email, STAFF_PASSWORD);
    const cashierCookie2 = await loginCookie(t, cashier.body.email, STAFF_PASSWORD);
    const floor = await seedMenu(t.app.get(DB), restaurantId);
    const guests = [
      await openSession(t.app.get(DB), floor),
      await openSession(t.app.get(DB), floor),
    ];
    // Guest pool (3) filled by two tables' phones.
    for (const path of ['/api/g/stream', '/api/g/bill/stream']) {
      const client = await openSse(`${base}${path}`, guests[0]?.guestCookie ?? '');
      clients.push(client);
      await client.waitFor((m) => m.event === 'snapshot');
    }
    const third = await openSse(`${base}/api/g/stream`, guests[1]?.guestCookie ?? '');
    clients.push(third);
    await third.waitFor((m) => m.event === 'snapshot');
    const refused = await fetch(`${base}/api/g/bill/stream`, {
      headers: { cookie: guests[1]?.guestCookie ?? '' },
    });
    expect(refused.status).toBe(429);
    expect(((await refused.json()) as { code: string }).code).toBe('TOO_MANY_STREAMS');
    // Staff still get their whole pool (3): owner, waiter and cashier screens all open.
    await open(owner.cookie);
    await open(waiterCookie);
    await open(cashierCookie2);
    expect(await statusOf(owner.cookie)).toBe(429);
  });

  it('ends the guest order stream and the guest bill stream once the cashier closes the table', async () => {
    const owner = await signUp(t);
    const restaurantId = (
      await request(t.app.getHttpServer()).get('/api/me').set('cookie', owner.cookie)
    ).body.restaurant.id as string;
    const floor = await seedMenu(t.app.get(DB), restaurantId);
    const session = await openSession(t.app.get(DB), floor);
    const streams: SseClient[] = [];
    for (const path of ['/api/g/stream', '/api/g/bill/stream']) {
      const client = await openSse(`${base}${path}`, session.guestCookie);
      clients.push(client);
      streams.push(client);
      await client.waitFor((m) => m.event === 'snapshot');
    }
    await request(t.app.getHttpServer())
      .post(`/api/sessions/${session.sessionId}/close`)
      .set('origin', ORIGIN)
      .set('cookie', owner.cookie)
      .send({})
      .expect(200);
    for (const client of streams) {
      await endsWithin(client, 2000);
      expect(client.messages.some((m) => m.event === 'revoked')).toBe(true);
    }
  });
});
