import { eq } from 'drizzle-orm';
import request from 'supertest';
import { DB, type Database } from '../src/db/database.module.js';
import { compareQueueItems } from '../src/kitchen/domain/queue.js';
import { orderItems } from '../src/service/service.schema.js';
import { createTestApp, type TestApp } from './support/app.js';
import { ORIGIN, signUp } from './support/http.js';
import { pickOne, prng } from './support/random.js';
import { openSession, releaseOrder, seedFloor } from './support/service-fixtures.js';
import { STAFF_PASSWORD, addStaff, loginCookie } from './support/staff.js';

/**
 * Fairness fitness function (spec quality targets, benchmarks/plan.md "Rush replay"): a dinner
 * rush of 30 tables and ~300 items worked by random cook and waiter actions. Afterwards no item
 * may have been finished before an older order of the same dish at its station unless a skip
 * reason was recorded (AC32, ADR 0005).
 */
describe('rush replay (fairness fitness function, e2e)', () => {
  let t: TestApp;
  let db: Database;

  beforeAll(async () => {
    t = await createTestApp();
    db = t.app.get(DB);
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('30 tables, ~300 items, random actions: 0 out-of-order finishes without a skip', async () => {
    const SEED = 20261108;
    const random = prng(SEED);
    const owner = await signUp(t);
    const restaurantId = owner.response.body.restaurant.id as string;
    const staff = async (role: 'kitchen' | 'waiter') =>
      loginCookie(t, (await addStaff(t, owner.cookie, role)).body.email, STAFF_PASSWORD);
    const cook = await staff('kitchen');
    const waiter = await staff('waiter');
    const floor = await seedFloor(db, restaurantId, 30);
    const dishes = [floor.pho, floor.bun, floor.tra];

    // 30 tables arrive over 30 minutes; each sends 2 orders of 3–7 lines; release times collide.
    const t0 = Date.parse('2026-11-08T18:00:00.000Z');
    for (const [index, tableId] of floor.tableIds.entries()) {
      const session = await openSession(db, restaurantId, tableId, {
        openedAt: new Date(t0 + index * 60_000),
      });
      for (let o = 0; o < 2; o += 1) {
        const lines = Array.from({ length: 3 + Math.floor(random() * 5) }, () => ({
          dish: pickOne(random, dishes),
        }));
        const minute = index + o * 10 + Math.floor(random() * 3);
        await releaseOrder(db, restaurantId, session, lines, {
          queueAt: new Date(t0 + minute * 60_000),
        });
      }
    }

    const http = () => request(t.app.getHttpServer());
    const act = (cookie: string, path: string, body: object) =>
      http().post(path).set('origin', ORIGIN).set('cookie', cookie).send(body);
    const live = async () =>
      db
        .select({ id: orderItems.id, status: orderItems.status, version: orderItems.version })
        .from(orderItems)
        .where(eq(orderItems.restaurantId, restaurantId));

    const stats = { actions: 0, refusedWithoutReason: 0, skips: 0, conflicts: 0 };
    for (let guard = 0; guard < 5000; guard += 1) {
      const items = await live();
      const open = items.filter((i) => i.status !== 'served');
      if (open.length === 0) break;
      const item = pickOne(random, open);
      t.clock.advance(1000);
      stats.actions += 1;
      if (item.status === 'waiting') {
        await act(cook, `/api/kitchen/items/${item.id}/start`, { version: item.version }).expect(
          200,
        );
      } else if (item.status === 'cooking') {
        const path = `/api/kitchen/items/${item.id}/done`;
        const response = await act(cook, path, { version: item.version });
        if (response.status === 422) {
          expect(response.body.code).toBe('SKIP_REASON_REQUIRED');
          stats.refusedWithoutReason += 1;
          // Half the time the cook gives a reason; otherwise they go cook the older one.
          if (random() < 0.5) {
            await act(cook, path, { version: item.version, skipReason: 'Khách giục' }).expect(200);
            stats.skips += 1;
          }
        } else {
          expect(response.status).toBe(200);
        }
      } else {
        await act(waiter, `/api/serve/items/${item.id}/serve`, { version: item.version }).expect(
          200,
        );
      }
    }

    const rows = await db
      .select({
        id: orderItems.id,
        stationId: orderItems.stationId,
        menuItemId: orderItems.menuItemId,
        status: orderItems.status,
        queueAt: orderItems.queueAt,
        sessionOpenedAt: orderItems.sessionOpenedAt,
        seq: orderItems.seq,
        doneAt: orderItems.doneAt,
        servedAt: orderItems.servedAt,
        skipReason: orderItems.skipReason,
      })
      .from(orderItems)
      .where(eq(orderItems.restaurantId, restaurantId));
    const keyOf = (r: (typeof rows)[number]) => ({
      queueAtUs: (r.queueAt?.getTime() ?? 0) * 1000,
      sessionOpenedAtUs: r.sessionOpenedAt.getTime() * 1000,
      seq: r.seq,
    });
    const time = (d: Date | null) => d?.getTime() ?? Number.POSITIVE_INFINITY;

    // Every item reached the table, and only after it was done.
    expect(rows.length).toBeGreaterThanOrEqual(180);
    expect(rows.every((r) => r.status === 'served' && time(r.doneAt) <= time(r.servedAt))).toBe(
      true,
    );

    // The fitness function: overtaking an older same dish without a recorded reason never happens.
    let unexplained = 0;
    let recordedSkips = 0;
    for (const later of rows) {
      if (later.skipReason !== null) recordedSkips += 1;
      for (const earlier of rows) {
        if (
          earlier.id !== later.id &&
          earlier.stationId === later.stationId &&
          earlier.menuItemId === later.menuItemId &&
          compareQueueItems(keyOf(earlier), keyOf(later)) < 0 &&
          time(later.doneAt) < time(earlier.doneAt) &&
          later.skipReason === null
        ) {
          unexplained += 1;
        }
      }
    }
    console.info(
      `rush replay (seed ${String(SEED)}): ${String(rows.length)} items, ${String(stats.actions)} actions, ` +
        `${String(stats.refusedWithoutReason)} refused without reason, ${String(recordedSkips)} recorded skips, ` +
        `${String(unexplained)} out-of-order finishes without a skip`,
    );
    expect(unexplained).toBe(0);
    // The replay really exercised the rule: cooks were stopped, and every reason given was kept.
    expect(stats.refusedWithoutReason).toBeGreaterThan(0);
    expect(recordedSkips).toBe(stats.skips);
    expect(recordedSkips).toBeGreaterThan(0);
  }, 180_000);
});
