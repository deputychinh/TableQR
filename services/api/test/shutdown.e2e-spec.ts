import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { DB } from '../src/db/database.module.js';
import { createTestApp, type TestApp } from './support/app.js';
import { signUp } from './support/http.js';
import { openSse, type SseClient } from './support/sse.js';
import { openSession, seedMenu } from './support/floor.js';
import { STAFF_PASSWORD, addStaff, loginCookie } from './support/staff.js';

/** Rejects when `promise` has not settled within `ms`. */
const within = <T>(promise: Promise<T>, ms: number, what: string): Promise<T> =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${what} still pending after ${String(ms)} ms`)), ms),
    ),
  ]);

/**
 * TQR-032: `app.close()` (SIGTERM through `enableShutdownHooks`, or `nest --watch` restarting) must
 * not wait for open event streams — a proxy keeps them open for as long as the browser is there.
 */
describe('graceful shutdown with open event streams (e2e, TQR-032)', () => {
  let t: TestApp;
  let base: string;
  let closed = false;

  beforeAll(async () => {
    t = await createTestApp();
    await t.app.listen(0, '127.0.0.1');
    const server = t.app.getHttpServer() as unknown as { address: () => AddressInfo };
    base = `http://127.0.0.1:${String(server.address().port)}`;
  });

  afterAll(async () => {
    if (!closed) await t.app.close();
  });

  it('ends every open stream with `bye` and closes within 2 s', async () => {
    const owner = await signUp(t);
    const restaurantId = (
      await request(t.app.getHttpServer()).get('/api/me').set('cookie', owner.cookie)
    ).body.restaurant.id as string;
    const floor = await seedMenu(t.app.get(DB), restaurantId);
    const session = await openSession(t.app.get(DB), floor);
    const cook = await addStaff(t, owner.cookie, 'kitchen');
    const cookCookie = await loginCookie(t, cook.body.email, STAFF_PASSWORD);
    const streams: SseClient[] = await Promise.all([
      openSse(`${base}/api/stream/floor`, owner.cookie),
      openSse(`${base}/api/stream/station/${floor.stationId}`, cookCookie),
      openSse(`${base}/api/g/stream`, session.guestCookie),
      openSse(`${base}/api/g/bill/stream`, session.guestCookie),
    ]);
    await Promise.all(streams.map((s) => s.waitFor((m) => m.event === 'snapshot')));

    const started = performance.now();
    await within(t.app.close(), 2000, 'app.close()');
    closed = true;
    expect(performance.now() - started).toBeLessThan(2000);
    await within(Promise.all(streams.map((s) => s.ended)), 500, 'stream end');
    for (const stream of streams) {
      expect(stream.messages.at(-1)?.event).toBe('bye');
    }
  });
});
