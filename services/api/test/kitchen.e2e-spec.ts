import type { AddressInfo } from 'node:net';
import { eq, inArray, sql } from 'drizzle-orm';
import request from 'supertest';
import { DB, type Database } from '../src/db/database.module.js';
import { compareQueueItems, type QueueKey } from '../src/kitchen/domain/queue.js';
import { RealtimeHub } from '../src/realtime/realtime.hub.js';
import type { RealtimeEvent } from '../src/realtime/domain/event.js';
import { orderItems } from '../src/service/service.schema.js';
import { createTestApp, type TestApp } from './support/app.js';
import { ORIGIN, signUp } from './support/http.js';
import { pickOne, prng } from './support/random.js';
import {
  openSession,
  releaseOrder,
  seedFloor,
  type Floor,
  type SeededItem,
} from './support/service-fixtures.js';
import { openSse, type SseClient } from './support/sse.js';
import { STAFF_PASSWORD, addStaff, loginCookie } from './support/staff.js';

interface Restaurant {
  id: string;
  owner: string;
  kitchen: string;
  waiter: string;
  floor: Floor;
}

describe('kitchen queue and serving (e2e, real Postgres) — TQR-014/015', () => {
  let t: TestApp;
  let db: Database;
  let base: string;
  let a: Restaurant;
  let b: Restaurant;
  const clients: SseClient[] = [];

  const http = () => request(t.app.getHttpServer());
  const get = (cookie: string, path: string) => http().get(path).set('cookie', cookie);
  const post = (cookie: string, path: string, body: object) =>
    http().post(path).set('origin', ORIGIN).set('cookie', cookie).send(body);
  const start = (cookie: string, item: { id: string }, version = 1) =>
    post(cookie, `/api/kitchen/items/${item.id}/start`, { version });
  const done = (cookie: string, item: { id: string }, version: number, skipReason?: string) =>
    post(cookie, `/api/kitchen/items/${item.id}/done`, { version, skipReason });
  const serve = (cookie: string, item: { id: string }, version: number) =>
    post(cookie, `/api/serve/items/${item.id}/serve`, { version });
  const queueOf = async (r: Restaurant, stationId = r.floor.stationId) =>
    (await get(r.kitchen, `/api/kitchen/stations/${stationId}/queue`).expect(200)).body as {
      station: { id: string; lateAfterMinutes: number };
      serverTime: string;
      reminder: { minutes: number; repeatMinutes: number };
      items: Record<string, unknown>[];
    };
  const rowOf = async (id: string) => {
    const [row] = await db.select().from(orderItems).where(eq(orderItems.id, id));
    if (!row) throw new Error('item not found');
    return row;
  };

  const restaurant = async (): Promise<Restaurant> => {
    const owner = await signUp(t);
    const id = owner.response.body.restaurant.id as string;
    const cookieFor = async (role: 'kitchen' | 'waiter') => {
      const { body } = await addStaff(t, owner.cookie, role);
      return loginCookie(t, body.email, STAFF_PASSWORD);
    };
    return {
      id,
      owner: owner.cookie,
      kitchen: await cookieFor('kitchen'),
      waiter: await cookieFor('waiter'),
      floor: await seedFloor(db, id, 6),
    };
  };

  /** Open sessions by `restaurant:table`, reused within a test (one open session per table). */
  const sessions = new Map<string, Awaited<ReturnType<typeof openSession>>>();

  /** One released order at table `n` (0-based), opening the table's session on first use. */
  const order = async (
    r: Restaurant,
    table: number,
    lines: Parameters<typeof releaseOrder>[3],
    options: { queueAt?: Date | string; openedAt?: Date; partySize?: number } = {},
  ): Promise<SeededItem[]> => {
    const key = `${r.id}:${String(table)}`;
    const session =
      sessions.get(key) ?? (await openSession(db, r.id, r.floor.tableIds[table] ?? '', options));
    sessions.set(key, session);
    return releaseOrder(db, r.id, session, lines, options);
  };

  beforeAll(async () => {
    t = await createTestApp();
    await t.app.listen(0, '127.0.0.1');
    const server = t.app.getHttpServer() as unknown as { address: () => AddressInfo };
    base = `http://127.0.0.1:${String(server.address().port)}`;
    db = t.app.get(DB);
    a = await restaurant();
    b = await restaurant();
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) client.close();
    sessions.clear();
    // Each test starts from an empty floor in restaurant A.
    await db.execute(
      sql`delete from table_sessions where restaurant_id in (${a.id}::uuid, ${b.id}::uuid)`,
    );
  });

  afterAll(async () => {
    await t.app.close();
  });

  describe('AC30 station queue order', () => {
    it('orders by release time, then table arrival, then line order', async () => {
      const t0 = Date.parse('2026-11-08T11:00:00.000Z');
      const at = (s: number) => new Date(t0 + s * 1000);
      const late = await order(a, 0, [{ dish: a.floor.pho }], {
        queueAt: at(30),
        openedAt: at(-600),
      });
      const tieLaterTable = await order(a, 1, [{ dish: a.floor.pho }], {
        queueAt: at(10),
        openedAt: at(-60),
      });
      const tieEarlierTable = await order(a, 2, [{ dish: a.floor.pho }, { dish: a.floor.bun }], {
        queueAt: at(10),
        openedAt: at(-120),
      });
      const first = await order(a, 3, [{ dish: a.floor.bun }], { queueAt: at(0) });
      await order(a, 4, [{ dish: a.floor.tra }], { queueAt: at(-100) }); // other station
      const queue = await queueOf(a);
      expect(queue.items.map((i) => i.id)).toEqual([
        first[0]?.id,
        tieEarlierTable[0]?.id,
        tieEarlierTable[1]?.id,
        tieLaterTable[0]?.id,
        late[0]?.id,
      ]);
    });

    it('SQL order and compareQueueItems agree on random data with microsecond ties', async () => {
      const random = prng(2026);
      const base0 = '2026-11-08T12:00:00.000';
      const queueTimes = [`${base0}001Z`, `${base0}002Z`, '2026-11-08T12:00:00.001Z'];
      const openTimes = [new Date('2026-11-08T11:00:00Z'), new Date('2026-11-08T11:30:00Z')];
      for (let i = 0; i < 40; i += 1) {
        await order(
          a,
          i % 6,
          [{ dish: pickOne(random, [a.floor.pho, a.floor.bun]) }, { dish: a.floor.pho }],
          {
            queueAt: pickOne(random, queueTimes),
            openedAt: pickOne(random, openTimes),
          },
        );
      }
      const queue = await queueOf(a);
      const ids = queue.items.map((i) => i.id as string);
      expect(ids).toHaveLength(80);
      const keys = await db
        .select({
          id: orderItems.id,
          queueAtUs:
            sql<number>`(extract(epoch from ${orderItems.queueAt}) * 1000000)::bigint`.mapWith(
              Number,
            ),
          sessionOpenedAtUs:
            sql<number>`(extract(epoch from ${orderItems.sessionOpenedAt}) * 1000000)::bigint`.mapWith(
              Number,
            ),
          seq: orderItems.seq,
        })
        .from(orderItems)
        .where(inArray(orderItems.id, ids));
      const sorted = [...keys].sort((x: QueueKey, y: QueueKey) => compareQueueItems(x, y));
      expect(sorted.map((k) => k.id)).toEqual(ids);
      // The microsecond ties really were exercised.
      expect(new Set(keys.map((k) => k.queueAtUs)).size).toBe(3);
    });

    it('lists stations with their waiting and cooking counts', async () => {
      const items = await order(a, 0, [{ dish: a.floor.pho }, { dish: a.floor.pho }]);
      await order(a, 1, [{ dish: a.floor.tra }]);
      await start(a.kitchen, items[0] ?? { id: '' }).expect(200);
      const { body } = await get(a.kitchen, '/api/kitchen/stations').expect(200);
      const stations = body.stations as { id: string; waiting: number; cooking: number }[];
      expect(stations.find((s) => s.id === a.floor.stationId)).toMatchObject({
        waiting: 1,
        cooking: 1,
        lateAfterMinutes: 15,
      });
      expect(stations.find((s) => s.id === a.floor.barId)).toMatchObject({
        waiting: 1,
        cooking: 0,
      });
      expect(stations.some((s) => s.id === b.floor.stationId)).toBe(false);
    });

    it('leaves out held (pending), done, served and cancelled items', async () => {
      const items = await order(a, 0, [
        { dish: a.floor.pho, status: 'pending' },
        { dish: a.floor.pho, status: 'done' },
        { dish: a.floor.pho, status: 'served' },
        { dish: a.floor.pho, status: 'cancelled' },
        { dish: a.floor.pho, status: 'cooking' },
      ]);
      expect((await queueOf(a)).items.map((i) => i.id)).toEqual([items[4]?.id]);
    });
  });

  describe('AC34 ticket and AC33 late highlight', () => {
    it('shows table name, party size, quantity, dish, note, release and late times', async () => {
      const queueAt = new Date(Date.now() - 20 * 60_000);
      await order(a, 2, [{ dish: a.floor.pho, quantity: 3, note: 'Không hành' }], {
        queueAt,
        partySize: 5,
      });
      await order(a, 3, [{ dish: a.floor.tra }], { queueAt });
      const [ticket] = (await queueOf(a)).items;
      expect(ticket).toMatchObject({
        status: 'waiting',
        version: 1,
        name: 'Phở bò tái',
        quantity: 3,
        note: 'Không hành',
        tableName: 'Bàn 3',
        partySize: 5,
        queueAt: queueAt.toISOString(),
        lateAt: new Date(queueAt.getTime() + 15 * 60_000).toISOString(),
        startedAt: null,
        orderId: expect.any(String),
      });
      const bar = await queueOf(a, a.floor.barId);
      expect(bar.items[0]?.lateAt).toBe(new Date(queueAt.getTime() + 5 * 60_000).toISOString());
      expect(Date.parse(bar.serverTime)).toBeGreaterThan(
        Date.parse(bar.items[0]?.lateAt as string),
      );
    });
  });

  describe('TQR-027/028 voice: order id per ticket, the reminder rule with the queue', () => {
    it('groups one order’s items by order id and sends the restaurant’s reminder rule', async () => {
      const r = await restaurant();
      await order(r, 0, [{ dish: r.floor.pho, quantity: 2 }, { dish: r.floor.pho }]);
      await order(r, 1, [{ dish: r.floor.pho }]);
      const before = await queueOf(r);
      expect(before.reminder).toEqual({ minutes: 10, repeatMinutes: 10 });
      const [first, second, third] = before.items.map((i) => i.orderId);
      expect(first).toBe(second);
      expect(third).not.toBe(first);

      const settings = (await get(r.owner, '/api/restaurant/settings').expect(200)).body as {
        rules: Record<string, unknown>;
      };
      await http()
        .put('/api/restaurant/settings')
        .set('origin', ORIGIN)
        .set('cookie', r.owner)
        .send({
          rules: { ...settings.rules, kitchen: { reminderMinutes: 5, repeatMinutes: 15 } },
          bank: null,
        })
        .expect(200);
      expect((await queueOf(r)).reminder).toEqual({ minutes: 5, repeatMinutes: 15 });
      // Another restaurant keeps its own rule (tenant from the session).
      expect((await queueOf(b)).reminder).toEqual({ minutes: 10, repeatMinutes: 10 });
    });
  });

  describe('cook actions (compare-and-set on status + version)', () => {
    it('moves waiting → cooking → done and bumps the version each time', async () => {
      const [item] = await order(a, 0, [{ dish: a.floor.pho }]);
      if (!item) throw new Error('no item');
      expect((await start(a.kitchen, item, 1).expect(200)).body).toEqual({
        id: item.id,
        status: 'cooking',
        version: 2,
        skipReason: null,
      });
      expect((await queueOf(a)).items[0]).toMatchObject({ status: 'cooking', version: 2 });
      expect((await done(a.kitchen, item, 2).expect(200)).body).toMatchObject({
        status: 'done',
        version: 3,
      });
      expect((await queueOf(a)).items).toEqual([]);
      const row = await rowOf(item.id);
      expect(row.startedAt).toBeInstanceOf(Date);
      expect(row.doneAt).toBeInstanceOf(Date);
      expect(row.skipReason).toBeNull();
    });

    it('answers 409 STALE_VERSION to a screen that missed a change', async () => {
      const [item] = await order(a, 0, [{ dish: a.floor.pho }]);
      if (!item) throw new Error('no item');
      await start(a.kitchen, item, 1).expect(200);
      const stale = await start(a.kitchen, item, 1).expect(409);
      expect(stale.body).toMatchObject({ code: 'STALE_VERSION', status: 409, version: 2 });
      await done(a.kitchen, item, 1).expect(409);
    });

    it('answers 409 INVALID_TRANSITION to an illegal move', async () => {
      const [waiting, cancelled, served] = await order(a, 0, [
        { dish: a.floor.pho },
        { dish: a.floor.pho, status: 'cancelled' },
        { dish: a.floor.pho, status: 'served' },
      ]);
      if (!waiting || !cancelled || !served) throw new Error('no items');
      const skip = await done(a.kitchen, waiting, 1).expect(409);
      expect(skip.body.code).toBe('INVALID_TRANSITION');
      expect((await start(a.kitchen, cancelled, 1).expect(409)).body).toMatchObject({
        code: 'INVALID_TRANSITION',
        status: 409,
      });
      await done(a.kitchen, cancelled, 1).expect(409);
      await start(a.kitchen, served, 1).expect(409);
      await serve(a.waiter, waiting, 1).expect(409);
      expect((await rowOf(cancelled.id)).status).toBe('cancelled');
    });

    it('lets exactly one of two cooks win the same item at the same moment', async () => {
      const [item] = await order(a, 0, [{ dish: a.floor.pho }]);
      if (!item) throw new Error('no item');
      const results = await Promise.all([start(a.kitchen, item, 1), start(a.owner, item, 1)]);
      expect(results.map((r) => r.status).sort((x, y) => x - y)).toEqual([200, 409]);
      expect((await rowOf(item.id)).version).toBe(2);
    });

    it('validates the body: version is required and whole', async () => {
      const [item] = await order(a, 0, [{ dish: a.floor.pho }]);
      if (!item) throw new Error('no item');
      const response = await post(a.kitchen, `/api/kitchen/items/${item.id}/start`, {}).expect(422);
      expect(response.body.code).toBe('VALIDATION_FAILED');
      await post(a.kitchen, `/api/kitchen/items/${item.id}/start`, { version: 'x' }).expect(422);
    });
  });

  describe('AC32 fairness: same dish, older order', () => {
    const twoTables = async () => {
      const older = await order(a, 0, [{ dish: a.floor.pho }, { dish: a.floor.bun }], {
        queueAt: new Date(Date.now() - 60_000),
      });
      const younger = await order(a, 1, [{ dish: a.floor.pho }, { dish: a.floor.bun }]);
      return { older, younger };
    };

    it('asks for a reason before a younger same dish is done, then records it', async () => {
      const { younger } = await twoTables();
      const pho = younger[0] ?? { id: '' };
      await start(a.kitchen, pho, 1).expect(200);
      const refused = await done(a.kitchen, pho, 2).expect(422);
      expect(refused.body).toMatchObject({
        code: 'SKIP_REASON_REQUIRED',
        older: [{ tableName: 'Bàn 1' }],
      });
      await done(a.kitchen, pho, 2, '   ').expect(422);
      expect((await rowOf(pho.id)).status).toBe('cooking');
      const ok = await done(a.kitchen, pho, 2, 'Bàn 2 có trẻ nhỏ').expect(200);
      expect(ok.body).toMatchObject({ status: 'done', skipReason: 'Bàn 2 có trẻ nhỏ' });
      expect((await rowOf(pho.id)).skipReason).toBe('Bàn 2 có trẻ nhỏ');
    });

    it('needs no reason for a different dish, or once the older one is done', async () => {
      const { older, younger } = await twoTables();
      const [olderPho, olderBun] = older;
      const [youngerPho, youngerBun] = younger;
      if (!olderPho || !olderBun || !youngerPho || !youngerBun) throw new Error('no items');
      // Older table still waits for phở; the younger table's bún only competes with older bún.
      await start(a.kitchen, olderBun, 1).expect(200);
      await done(a.kitchen, olderBun, 2).expect(200);
      await start(a.kitchen, youngerBun, 1).expect(200);
      expect((await done(a.kitchen, youngerBun, 2).expect(200)).body.skipReason).toBeNull();
      // Finishing the older phở first means the younger one is not a skip.
      await start(a.kitchen, olderPho, 1).expect(200);
      await done(a.kitchen, olderPho, 2).expect(200);
      await start(a.kitchen, youngerPho, 1).expect(200);
      expect(
        (await done(a.kitchen, youngerPho, 2, 'không cần').expect(200)).body.skipReason,
      ).toBeNull();
    });
  });

  describe('AC35–AC37 waiter ready list and serve', () => {
    it('lists done dishes under their table, oldest first, serves them and shows "Đủ món"', async () => {
      const [pho, tra] = await order(a, 0, [{ dish: a.floor.pho }, { dish: a.floor.tra }]);
      const [bun] = await order(a, 1, [{ dish: a.floor.bun }]);
      if (!pho || !tra || !bun) throw new Error('no items');
      const finish = async (item: SeededItem) => {
        await start(a.kitchen, item, 1).expect(200);
        await done(a.kitchen, item, 2, 'thử').expect(200);
        t.clock.advance(1000);
      };
      await finish(bun);
      await finish(tra);
      const ready = (await get(a.waiter, '/api/serve/ready').expect(200)).body as {
        tables: {
          tableName: string;
          ready: { id: string }[];
          remaining: number;
          complete: boolean;
        }[];
      };
      expect(ready.tables.map((x) => [x.tableName, x.ready.map((i) => i.id), x.remaining])).toEqual(
        [
          ['Bàn 2', [bun.id], 0],
          ['Bàn 1', [tra.id], 1],
        ],
      );

      const served = await serve(a.waiter, bun, 3).expect(200);
      expect(served.body).toMatchObject({ status: 'served', version: 4 });
      const row = await rowOf(bun.id);
      expect(row.servedAt).toBeInstanceOf(Date);
      const me = await get(a.waiter, '/api/me').expect(200);
      expect(row.servedBy).toBe(me.body.user.id);

      const after = (await get(a.waiter, '/api/serve/ready').expect(200)).body as typeof ready;
      expect(after.tables.find((x) => x.tableName === 'Bàn 2')).toMatchObject({
        ready: [],
        complete: true,
      });
      expect(after.tables.find((x) => x.tableName === 'Bàn 1')?.complete).toBe(false);
      await serve(a.waiter, bun, 4).expect(409);
    });
  });

  describe('roles', () => {
    it('a waiter cannot cook and a cook cannot serve (403)', async () => {
      const [waiting, ready] = await order(a, 0, [
        { dish: a.floor.pho },
        { dish: a.floor.pho, status: 'done' },
      ]);
      if (!waiting || !ready) throw new Error('no items');
      expect((await start(a.waiter, waiting).expect(403)).body.code).toBe('FORBIDDEN');
      await done(a.waiter, waiting, 1).expect(403);
      await get(a.waiter, `/api/kitchen/stations/${a.floor.stationId}/queue`).expect(403);
      expect((await serve(a.kitchen, ready, 1).expect(403)).body.code).toBe('FORBIDDEN');
      await get(a.kitchen, '/api/serve/ready').expect(403);
      await get(a.waiter, `/api/stream/station/${a.floor.stationId}`).expect(403);
      await http().get('/api/kitchen/stations').expect(401);
    });
  });

  describe('tenant isolation (ADR 0003): another restaurant’s ids answer 404', () => {
    it('B’s cook and waiter cannot see or touch A’s items and stations', async () => {
      const [waiting, ready] = await order(a, 0, [
        { dish: a.floor.pho },
        { dish: a.floor.pho, status: 'done' },
      ]);
      if (!waiting || !ready) throw new Error('no items');
      await start(b.kitchen, waiting).expect(404);
      await done(b.kitchen, waiting, 1, 'x').expect(404);
      await serve(b.waiter, ready, 1).expect(404);
      await get(b.kitchen, `/api/kitchen/stations/${a.floor.stationId}/queue`).expect(404);
      await get(b.kitchen, `/api/stream/station/${a.floor.stationId}`).expect(404);
      const board = (await get(b.waiter, '/api/serve/ready').expect(200)).body as {
        tables: unknown[];
      };
      expect(board.tables).toEqual([]);
      expect((await rowOf(waiting.id)).version).toBe(1);
      await start(a.kitchen, { id: 'not-a-uuid' }).expect(404);
      await get(a.kitchen, '/api/kitchen/stations/not-a-uuid/queue').expect(404);
    });
  });

  describe('AC31 realtime: every audience hears the change within 2 s', () => {
    it('cook marks done → station, floor and session get item.status deltas', async () => {
      const [item] = await order(a, 0, [{ dish: a.floor.pho }]);
      if (!item) throw new Error('no item');
      const [row] = await db
        .select({ sessionId: orderItems.sessionId })
        .from(orderItems)
        .where(eq(orderItems.id, item.id));
      const sessionEvents: { event: RealtimeEvent; at: number }[] = [];
      const unsubscribe = t.app
        .get(RealtimeHub)
        .subscribe(a.id, [`session:${row?.sessionId ?? ''}`], (event) => {
          if (event !== 'resync' && event !== 'revoked') {
            sessionEvents.push({ event, at: performance.now() });
          }
        });
      const station = await openSse(`${base}/api/stream/station/${a.floor.stationId}`, a.kitchen);
      const floor = await openSse(`${base}/api/stream/floor`, a.waiter);
      clients.push(station, floor);
      const snapshot = await station.waitFor((m) => m.event === 'snapshot');
      expect((snapshot.data.items as { id: string }[]).map((i) => i.id)).toEqual([item.id]);
      await floor.waitFor((m) => m.event === 'snapshot');

      await start(a.kitchen, item, 1).expect(200);
      const sentAt = performance.now();
      await done(a.kitchen, item, 2).expect(200);
      const isDone = (m: { event: string; data: Record<string, unknown> }) =>
        m.event === 'delta' && m.data.itemId === item.id && m.data.status === 'done';
      const [stationDelta, floorDelta] = await Promise.all([
        station.waitFor(isDone),
        floor.waitFor(isDone),
      ]);
      await expect
        .poll(() => sessionEvents.find((e) => e.event.data.status === 'done'), { timeout: 2000 })
        .toBeDefined();
      unsubscribe();
      expect(floorDelta.data).toEqual({
        topic: 'floor',
        type: 'item.status',
        itemId: item.id,
        status: 'done',
        version: 3,
      });
      expect(stationDelta.data.topic).toBe(`station:${a.floor.stationId}`);
      const delays = [
        stationDelta.at - sentAt,
        floorDelta.at - sentAt,
        (sessionEvents.find((e) => e.event.data.status === 'done')?.at ?? Infinity) - sentAt,
      ];
      console.info(`AC31 delays (ms): ${delays.map((d) => d.toFixed(1)).join(', ')}`);
      for (const delay of delays) expect(delay).toBeLessThan(2000);
    });

    it('the floor snapshot carries the ready board', async () => {
      await order(a, 0, [{ dish: a.floor.pho, status: 'done' }]);
      const floor = await openSse(`${base}/api/stream/floor`, a.waiter);
      clients.push(floor);
      const snapshot = await floor.waitFor((m) => m.event === 'snapshot');
      expect(snapshot.data).toMatchObject({
        at: expect.any(String),
        ready: { tables: [{ tableName: 'Bàn 1', ready: [{ name: 'Phở bò tái' }] }] },
      });
    });

    it('the station stream hears newly released items (ordering publishes waiting)', async () => {
      const station = await openSse(`${base}/api/stream/station/${a.floor.barId}`, a.kitchen);
      clients.push(station);
      const snapshot = await station.waitFor((m) => m.event === 'snapshot');
      expect(snapshot.data.items).toEqual([]);
      const session = await openSession(db, a.id, a.floor.tableIds[5] ?? '');
      const [item] = await releaseOrder(db, a.id, session, [{ dish: a.floor.tra }], {
        publishEvents: true,
      });
      const delta = await station.waitFor((m) => m.event === 'delta');
      expect(delta.data).toMatchObject({ itemId: item?.id, status: 'waiting', version: 1 });
    });
  });

  it('random cook actions never change another table’s queue position', async () => {
    const random = prng(7);
    const items: SeededItem[] = [];
    for (let i = 0; i < 6; i += 1) {
      items.push(...(await order(a, i, [{ dish: a.floor.pho }, { dish: a.floor.bun }])));
    }
    const before = (await queueOf(a)).items.map((i) => i.id);
    for (const item of items.filter(() => random() < 0.5)) {
      await start(a.kitchen, item, 1).expect(200);
    }
    const after = (await queueOf(a)).items.map((i) => i.id);
    expect(after).toEqual(before);
  });
});
