import request from 'supertest';
import { utcToLocal } from '../src/booking/domain/slots.js';
import { createTestApp, type TestApp } from './support/app.js';
import { ORIGIN, signUp } from './support/http.js';
import {
  ALL_ROLES,
  ROLE_MATRIX,
  type MatrixFixture,
  type MatrixRole,
} from './support/role-matrix.js';
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
    fixture = {
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
    bookingId: ':bookingId',
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
