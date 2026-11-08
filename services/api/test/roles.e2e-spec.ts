import { randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { Controller, Get, UseGuards } from '@nestjs/common';
import request from 'supertest';
import { StaffGuard } from '../src/identity/guards.js';
import { IdentityModule } from '../src/identity/identity.module.js';
import { DB } from '../src/db/database.module.js';
import { bookings, diningTables } from '../src/db/schema.js';
import { utcToLocal } from '../src/booking/domain/slots.js';
import { createTestApp, type TestApp } from './support/app.js';
import { addOrder, openSession, seedMenu, type SessionFixture } from './support/floor.js';
import { ORIGIN, signUp } from './support/http.js';
import { listRoutes } from './support/routes.js';
import { tenantSnapshot } from './support/tenant-snapshot.js';
import {
  ALL_ROLES,
  PLACEHOLDERS,
  ROLE_MATRIX,
  uncoveredRoutes,
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

/** A test-only route behind the staff guard that forgot its `@Roles`: nobody may call it. */
@Controller('test-roles')
@UseGuards(StaffGuard)
class NoRolesController {
  @Get('forgotten')
  forgotten(): { ok: true } {
    return { ok: true };
  }
}

describe('AC15 role matrix (e2e): deny by default for every staff endpoint', () => {
  let t: TestApp;
  let base: string;
  const cookies = new Map<MatrixRole, string>();
  let fixture: MatrixFixture;
  /** Owner of another restaurant: must never reach the fixture restaurant's rows (TQR-017). */
  let intruderCookie = '';
  /** The fixture restaurant, whose rows the intruder targets: snapshotted around each call. */
  let fixtureRestaurantId = '';

  beforeAll(async () => {
    t = await createTestApp({ imports: [IdentityModule], controllers: [NoRolesController] });
    await t.app.listen(0, '127.0.0.1');
    const server = t.app.getHttpServer() as unknown as { address: () => AddressInfo };
    base = `http://127.0.0.1:${server.address().port}`;
    const owner = await signUp(t);
    cookies.set('owner', owner.cookie);
    for (const role of ['cashier', 'waiter', 'kitchen'] as const) {
      const { body } = await addStaff(t, owner.cookie, role);
      cookies.set(role, await loginCookie(t, body.email, STAFF_PASSWORD));
    }
    cookies.set('platform_admin', (await platformAdminCookie(t)).cookie);
    intruderCookie = (await signUp(t)).cookie;
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
    // One-shot rows: a fresh row per call — one per role, one for the intruder (so a missing tenant
    // scope would really change it), one for the 401 sweep; cycled beyond that.
    const ONE_SHOT = ALL_ROLES.length + 2;
    const times = <T>(make: () => Promise<T>, rows = 1) =>
      Promise.all(Array.from({ length: ONE_SHOT * rows }, () => make()));
    const payable = await times(async () => billFor(await openSession(db, floor)));
    const closable = await times(async () => (await openSession(db, floor)).sessionId);
    const cycle = (ids: string[]) => {
      let next = 0;
      return () => ids[next++ % ids.length] ?? '';
    };
    // Waiter review (TQR-013): held orders for confirm/reject, on a session of their own.
    const reviewSession = await openSession(db, floor);
    const heldOrders = await times(
      async () =>
        (await addOrder(db, floor, reviewSession, 'held', [{ priceVnd: 10_000, quantity: 1 }]))
          .orderId,
      2, // confirm and reject
    );
    const { orderId: flaggedOrderId } = await addOrder(db, floor, reviewSession, 'released', [
      { priceVnd: 10_000, quantity: 1 },
    ]);
    // Free tables (no session) for opening a session, and one per booking so seating never clashes.
    let freeTables = 0;
    const freeTable = async () => {
      freeTables += 1;
      const [row] = await db
        .insert(diningTables)
        .values({
          restaurantId: floor.restaurantId,
          name: `Bàn trống ${String(freeTables)}`,
          seats: 4,
          qrToken: randomBytes(16).toString('base64url'),
        })
        .returning({ id: diningTables.id });
      return row?.id ?? '';
    };
    // Bookings that started 30 minutes ago: seat, cancel and no-show are all allowed on them.
    const freshBooking = async () => {
      const [row] = await db
        .insert(bookings)
        .values({
          restaurantId: floor.restaurantId,
          tableId: await freeTable(),
          partySize: 2,
          guestName: 'Khách ma trận',
          guestPhone: '+84901234567',
          startsAt: new Date(Date.now() - 30 * 60_000),
          endsAt: new Date(Date.now() + 60 * 60_000),
          idempotencyKey: randomUUID(),
        })
        .returning({ id: bookings.id });
      return row?.id ?? '';
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
    fixtureRestaurantId = restaurantId;
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
        Array.from({ length: 16 }, () => ({ dish: kitchenFloor.pho, status })),
      );
      const ids = items.map((i) => i.id);
      return () => ids.shift() ?? 'pool-empty';
    };
    const create = async (path: string, body: object) =>
      (
        await request(t.app.getHttpServer())
          .post(path)
          .set('origin', ORIGIN)
          .set('cookie', owner.cookie)
          .send(body)
          .expect(201)
      ).body.id as string;
    let names = 0;
    const name = (prefix: string) => {
      names += 1;
      return `${prefix} ma trận ${String(names)}`;
    };
    // Menu rows reuse the kitchen station of the fixture restaurant.
    const categoryId = await create('/api/menu/categories', { name: name('Nhóm') });
    const item = () =>
      create('/api/menu/items', {
        name: name('Món'),
        priceVnd: 30000,
        categoryId,
        stationId: kitchenFloor.stationId,
      });
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
      freshBookingId: cycle(await times(freshBooking, 3)), // seat, cancel and no-show
      freeTableId: cycle(await times(freeTable)),
      heldOrderId: cycle(heldOrders),
      flaggedOrderId,
      spareStationId: await create('/api/menu/stations', { name: name('Khu xoá') }),
      categoryId,
      spareCategoryId: await create('/api/menu/categories', { name: name('Nhóm xoá') }),
      itemId: await item(),
      spareItemId: await item(),
      name,
    };
  });

  afterAll(async () => {
    await t.app.close();
  });
  /** Opens a stream row and closes it as soon as the status is known. */
  const streamStatus = async (path: string, cookie: string) => {
    const response = await fetch(`${base}${path}`, { headers: cookie ? { cookie } : {} });
    if (response.ok) {
      await response.body?.cancel();
      return { status: response.status, code: undefined };
    }
    return { status: response.status, code: ((await response.json()) as { code: string }).code };
  };
  // The isolation sweep runs BEFORE the role matrix: the matrix's owner rows delete the spare
  // rows (one-shot), so a later intruder DELETE would hit an id that no longer exists and prove
  // nothing. Swept first, every intruder call targets a live row of the fixture restaurant.
  /** Rows that name a row of the fixture restaurant, in the path or in the body (ids are ':…'). */
  const referencesFixtureRow = (row: (typeof ROLE_MATRIX)[number]): boolean =>
    row.path(PLACEHOLDERS).includes('/:') ||
    // A placeholder id value serialises as `"key":":placeholder"`.
    (row.body !== undefined && JSON.stringify(row.body(PLACEHOLDERS)).includes('":":'));
  const isolationCases = ROLE_MATRIX.filter(
    (row) => row.allowed.includes('owner') && referencesFixtureRow(row),
  );

  it('TQR-017 has id-bearing rows to sweep', () => {
    expect(isolationCases.length).toBeGreaterThan(20);
  });

  it.each(isolationCases.map((row) => [row.method.toUpperCase(), row.path(PLACEHOLDERS), row]))(
    'TQR-017 tenant isolation: %s %s as the owner of another restaurant → 404, nothing changes',
    async (_method, _path, row) => {
      const db = t.app.get(DB);
      const before = await tenantSnapshot(db, fixtureRestaurantId);
      if (row.stream) {
        const { status } = await streamStatus(row.path(fixture), intruderCookie);
        expect(status).toBe(404);
      } else {
        let call = request(t.app.getHttpServer())
          [row.method](row.path(fixture))
          .set('origin', ORIGIN)
          .set('cookie', intruderCookie);
        if (row.body) call = call.send(row.body(fixture) as object);
        const response = await call;
        expect({ status: response.status, code: response.body.code }).toMatchObject({
          status: 404,
        });
      }
      // A 404 is not enough: a handler that writes before it checks the tenant would also answer
      // 404. Every row of the fixture restaurant must be exactly as it was.
      expect(await tenantSnapshot(db, fixtureRestaurantId)).toEqual(before);
    },
  );

  it('TQR-017 route coverage: every staff route is in ROLE_MATRIX or excluded with a reason', () => {
    expect(uncoveredRoutes(listRoutes(t.app), ROLE_MATRIX)).toEqual([]);
  });

  const cases = ROLE_MATRIX.flatMap((row) =>
    ALL_ROLES.map((role) => ({ row, role, allowed: row.allowed.includes(role) })),
  );

  it.each(cases.map((c) => [c.row.method.toUpperCase(), c.row.path(PLACEHOLDERS), c.role, c]))(
    '%s %s as %s',
    async (_method, _path, _role, { row, role, allowed }) => {
      const cookie = cookies.get(role) ?? '';
      if (row.stream) {
        const { status, code } = await streamStatus(row.path(fixture), cookie);
        if (allowed) expect(status).toBe(200);
        else expect({ status, code }).toEqual({ status: 403, code: 'FORBIDDEN' });
        return;
      }
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
      if (row.stream) {
        expect((await streamStatus(row.path(fixture), '')).status).toBe(401);
        continue;
      }
      const response = await request(t.app.getHttpServer())
        [row.method](row.path(fixture))
        .set('origin', ORIGIN);
      expect(response.status).toBe(401);
    }
  });

  it('refuses every role on a guarded route that lists no roles (deny by default)', async () => {
    for (const role of ALL_ROLES) {
      const response = await request(t.app.getHttpServer())
        .get('/api/test-roles/forgotten')
        .set('cookie', cookies.get(role) ?? '');
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('FORBIDDEN');
    }
  });
});
