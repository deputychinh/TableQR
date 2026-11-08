import request from 'supertest';
import { DB } from '../src/db/database.module.js';
import { utcToLocal } from '../src/booking/domain/slots.js';
import { createTestApp, type TestApp } from './support/app.js';
import { addOrder, openSession, seedMenu, type SessionFixture } from './support/floor.js';
import { ORIGIN, signUp } from './support/http.js';
import {
  ALL_ROLES,
  ROLE_MATRIX,
  type MatrixFixture,
  type MatrixRole,
} from './support/role-matrix.js';
import {
  openSession as openKitchenSession,
  releaseOrder,
  seedFloor,
} from './support/service-fixtures.js';
import {
  STAFF_PASSWORD,
  addStaff,
  loginCookie,
  platformAdminCookie,
  uniqueEmail,
} from './support/staff.js';

describe('AC15 role matrix (e2e): deny by default for every staff endpoint', () => {
  let t: TestApp;
  const cookies = new Map<MatrixRole, string>();
  let fixture: MatrixFixture;

  beforeAll(async () => {
    t = await createTestApp();
    const owner = await signUp(t);
    cookies.set('owner', owner.cookie);
    for (const role of ['cashier', 'waiter', 'kitchen'] as const) {
      const { body } = await addStaff(t, owner.cookie, role);
      cookies.set(role, await loginCookie(t, body.email, STAFF_PASSWORD));
    }
    cookies.set('platform_admin', (await platformAdminCookie(t)).cookie);
    const target = await addStaff(t, owner.cookie, 'waiter');
    const spare = await signUp(t);
    const table = async (name: string) =>
      (
        await request(t.app.getHttpServer())
          .post('/api/tables')
          .set('origin', ORIGIN)
          .set('cookie', owner.cookie)
          .send({ name, seats: 4 })
          .expect(201)
      ).body.id as string;
    const db = t.app.get(DB);
    const floor = await seedMenu(db, owner.response.body.restaurant.id as string);
    const billFor = async (session: SessionFixture) => {
      await addOrder(db, floor, session, 'released', [{ priceVnd: 10_000, quantity: 1 }]);
      return (
        await request(t.app.getHttpServer())
          .post('/api/bills')
          .set('origin', ORIGIN)
          .set('cookie', owner.cookie)
          .send({ sessionId: session.sessionId })
          .expect(200)
      ).body.bill.id as string;
    };
    const billed = await openSession(db, floor);
    const billId = await billFor(billed);
    // One per role (each case calls the path once), cycled for the 401 sweep.
    const payable = await Promise.all(
      ALL_ROLES.map(async () => billFor(await openSession(db, floor))),
    );
    const closable = await Promise.all(
      ALL_ROLES.map(async () => (await openSession(db, floor)).sessionId),
    );
    const cycle = (ids: string[]) => {
      let next = 0;
      return () => ids[next++ % ids.length] ?? '';
    };
    const tableId = await table('Bàn ma trận');
    const booking = await request(t.app.getHttpServer())
      .post(`/api/g/r/${owner.response.body.restaurant.slug as string}/bookings`)
      .set('origin', ORIGIN)
      .set('idempotency-key', 'role-matrix-booking')
      .send({
        date: utcToLocal(new Date(Date.now() + 2 * 86_400_000)).date,
        time: '12:00',
        partySize: 2,
        name: 'Khách ma trận',
        phone: '0901234567',
      })
      .expect(201);
    // Kitchen and serving rows: a pool of items per status, one consumed per call.
    const restaurantId = owner.response.body.restaurant.id as string;
    const kitchenFloor = await seedFloor(db, restaurantId, 1);
    const kitchenSession = await openKitchenSession(
      db,
      restaurantId,
      kitchenFloor.tableIds[0] ?? '',
    );
    const pool = async (status: 'waiting' | 'cooking' | 'done') => {
      const items = await releaseOrder(
        db,
        restaurantId,
        kitchenSession,
        Array.from({ length: 8 }, () => ({ dish: kitchenFloor.pho, status })),
      );
      const ids = items.map((i) => i.id);
      return () => ids.shift() ?? 'pool-empty';
    };
    fixture = {
      sessionId: billed.sessionId,
      billId,
      payableBillId: cycle(payable),
      closableSessionId: cycle(closable),
      stationId: kitchenFloor.stationId,
      waitingItemId: await pool('waiting'),
      cookingItemId: await pool('cooking'),
      doneItemId: await pool('done'),
      staffId: target.member.id,
      spareRestaurantId: spare.response.body.restaurant.id as string,
      email: () => uniqueEmail('matrix'),
      tableId,
      spareTableId: await table('Bàn xoá'),
      bookingId: booking.body.id as string,
    };
  });

  afterAll(async () => {
    await t.app.close();
  });

  const placeholders: MatrixFixture = {
    staffId: ':staffId',
    spareRestaurantId: ':restaurantId',
    email: () => 'new@example.com',
    tableId: ':tableId',
    spareTableId: ':spareTableId',
    sessionId: ':sessionId',
    billId: ':billId',
    payableBillId: () => ':billId',
    closableSessionId: () => ':sessionId',
    bookingId: ':bookingId',
    stationId: ':stationId',
    waitingItemId: () => ':itemId',
    cookingItemId: () => ':itemId',
    doneItemId: () => ':itemId',
  };
  const cases = ROLE_MATRIX.flatMap((row) =>
    ALL_ROLES.map((role) => ({ row, role, allowed: row.allowed.includes(role) })),
  );

  it.each(cases.map((c) => [c.row.method.toUpperCase(), c.row.path(placeholders), c.role, c]))(
    '%s %s as %s',
    async (_method, _path, _role, { row, role, allowed }) => {
      const cookie = cookies.get(role) ?? '';
      let call = request(t.app.getHttpServer())
        [row.method](row.path(fixture))
        .set('origin', ORIGIN)
        .set('cookie', cookie);
      if (row.body) call = call.send(row.body(fixture) as object);
      const response = await call;
      if (allowed) {
        expect([401, 403]).not.toContain(response.status);
        expect(response.status).toBeLessThan(400);
      } else {
        expect(response.status).toBe(403);
        expect(response.body.code).toBe('FORBIDDEN');
      }
    },
  );

  it('answers 401 (not 403) to every matrix endpoint without a session', async () => {
    for (const row of ROLE_MATRIX) {
      const response = await request(t.app.getHttpServer())
        [row.method](row.path(fixture))
        .set('origin', ORIGIN);
      expect(response.status).toBe(401);
    }
  });
});
