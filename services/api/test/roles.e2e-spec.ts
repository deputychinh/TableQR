import type { AddressInfo } from 'node:net';
import { Controller, Get, UseGuards } from '@nestjs/common';
import request from 'supertest';
import { StaffGuard } from '../src/identity/guards.js';
import { IdentityModule } from '../src/identity/identity.module.js';
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
    const stationId = await create('/api/menu/stations', { name: name('Khu') });
    const categoryId = await create('/api/menu/categories', { name: name('Nhóm') });
    const item = () =>
      create('/api/menu/items', { name: name('Món'), priceVnd: 30000, categoryId, stationId });
    fixture = {
      staffId: target.member.id,
      spareRestaurantId: spare.response.body.restaurant.id as string,
      email: () => uniqueEmail('matrix'),
      tableId: await table('Bàn ma trận'),
      spareTableId: await table('Bàn xoá'),
      stationId,
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

  const placeholders: MatrixFixture = {
    staffId: ':staffId',
    spareRestaurantId: ':restaurantId',
    email: () => 'new@example.com',
    tableId: ':tableId',
    spareTableId: ':spareTableId',
    stationId: ':stationId',
    spareStationId: ':spareStationId',
    categoryId: ':categoryId',
    spareCategoryId: ':spareCategoryId',
    itemId: ':itemId',
    spareItemId: ':spareItemId',
    name: (prefix) => prefix,
  };

  /** Opens a stream row and closes it as soon as the status is known. */
  const streamStatus = async (path: string, cookie: string) => {
    const response = await fetch(`${base}${path}`, { headers: cookie ? { cookie } : {} });
    if (response.ok) {
      await response.body?.cancel();
      return { status: response.status, code: undefined };
    }
    return { status: response.status, code: ((await response.json()) as { code: string }).code };
  };
  const cases = ROLE_MATRIX.flatMap((row) =>
    ALL_ROLES.map((role) => ({ row, role, allowed: row.allowed.includes(role) })),
  );

  it.each(cases.map((c) => [c.row.method.toUpperCase(), c.row.path(placeholders), c.role, c]))(
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
