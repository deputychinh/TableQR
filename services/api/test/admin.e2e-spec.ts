import request from 'supertest';
import { asTenantId } from '../src/common/tenant.js';
import { DomainError } from '../src/common/errors/domain.error.js';
import { RestaurantStatusService } from '../src/identity/restaurant-status.service.js';
import { createTestApp, type TestApp } from './support/app.js';
import { ORIGIN, signUp } from './support/http.js';
import {
  STAFF_PASSWORD,
  addStaff,
  login,
  loginCookie,
  platformAdminCookie,
  runCreatePlatformAdmin,
  uniqueEmail,
} from './support/staff.js';

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('platform admin: suspend / reactivate a restaurant (e2e, spec S16)', () => {
  let t: TestApp;
  let admin: Awaited<ReturnType<typeof platformAdminCookie>>;
  const http = () => request(t.app.getHttpServer());
  const act = (action: 'suspend' | 'reactivate', id: string, cookie = admin.cookie) =>
    http()
      .post(`/api/admin/restaurants/${id}/${action}`)
      .set('origin', ORIGIN)
      .set('cookie', cookie);
  const restaurantIdOf = (owner: Awaited<ReturnType<typeof signUp>>): string =>
    owner.response.body.restaurant.id as string;

  beforeAll(async () => {
    t = await createTestApp();
    admin = await platformAdminCookie(t);
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('the CLI creates a platform admin with no restaurant who lands on /api/me', async () => {
    const me = await http().get('/api/me').set('cookie', admin.cookie).expect(200);
    expect(me.body).toMatchObject({ user: { role: 'platform_admin' }, restaurant: null });
  });

  it('the CLI never prints the password and refuses a weak password or a taken email', async () => {
    const email = uniqueEmail('cli');
    const password = 'cli-mat-khau-dai-1';
    const ok = await runCreatePlatformAdmin(['--email', email], { TQR_ADMIN_PASSWORD: password });
    expect(ok.stdout).toMatch(/Platform admin created/);
    expect(ok.stdout + ok.stderr).not.toContain(password);
    expect(ok.stdout + ok.stderr).not.toContain(email);
    await expect(
      runCreatePlatformAdmin(['--email', email], { TQR_ADMIN_PASSWORD: password }),
    ).rejects.toMatchObject({ code: 1, stderr: expect.stringMatching(/already has an account/) });
    await expect(
      runCreatePlatformAdmin(['--email', uniqueEmail('cli')], { TQR_ADMIN_PASSWORD: 'ngan' }),
    ).rejects.toMatchObject({ code: 1, stderr: expect.stringMatching(/password/) });
  });

  it('lists restaurants newest first with owner email and staff count, paged (max 200)', async () => {
    const owner = await signUp(t);
    await addStaff(t, owner.cookie, 'kitchen');
    const page = await http()
      .get('/api/admin/restaurants?limit=5&offset=0')
      .set('cookie', admin.cookie)
      .expect(200);
    expect(page.body).toMatchObject({ limit: 5, offset: 0 });
    expect(page.body.total).toBeGreaterThanOrEqual(1);
    expect(page.body.items[0]).toMatchObject({
      id: restaurantIdOf(owner),
      name: owner.body.restaurantName,
      status: 'active',
      ownerEmail: owner.body.email.toLowerCase(),
      staffCount: 2,
    });
    const next = await http()
      .get('/api/admin/restaurants?limit=1&offset=1')
      .set('cookie', admin.cookie)
      .expect(200);
    expect(next.body.items[0]?.id).not.toBe(restaurantIdOf(owner));
    for (const bad of ['limit=201', 'limit=0', 'offset=-1', 'limit=abc', 'sort=name']) {
      await http().get(`/api/admin/restaurants?${bad}`).set('cookie', admin.cookie).expect(422);
    }
  });

  it('AC54 suspending signs the staff out at once and refuses their sign-in until reactivated', async () => {
    const owner = await signUp(t);
    const { body } = await addStaff(t, owner.cookie, 'waiter');
    const waiter = await loginCookie(t, body.email, STAFF_PASSWORD);

    const suspended = await act('suspend', restaurantIdOf(owner)).expect(200);
    expect(suspended.body.status).toBe('suspended');
    await http().get('/api/me').set('cookie', owner.cookie).expect(401);
    await http().get('/api/me').set('cookie', waiter).expect(401);
    for (const credentials of [
      { email: owner.body.email, password: owner.body.password },
      { email: body.email, password: STAFF_PASSWORD },
    ]) {
      const refused = await login(t, credentials.email, credentials.password).expect(403);
      expect(refused.body).toMatchObject({
        code: 'RESTAURANT_SUSPENDED',
        detail: 'Nhà hàng tạm ngưng',
      });
    }
    // A wrong password still gets the generic answer: suspension is only revealed after it.
    const wrong = await login(t, body.email, 'sai-mat-khau-123').expect(401);
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
    await act('suspend', restaurantIdOf(owner)).expect(200); // idempotent

    const reactivated = await act('reactivate', restaurantIdOf(owner)).expect(200);
    expect(reactivated.body.status).toBe('active');
    await login(t, owner.body.email, owner.body.password).expect(200);
    await login(t, body.email, STAFF_PASSWORD).expect(200);
  });

  it('AC54 suspending one restaurant leaves other restaurants signed in', async () => {
    const a = await signUp(t);
    const b = await signUp(t);
    await act('suspend', restaurantIdOf(a)).expect(200);
    await http().get('/api/me').set('cookie', b.cookie).expect(200);
    await act('reactivate', restaurantIdOf(a)).expect(200);
  });

  it('AC54 assertRestaurantActive (for guest pages) refuses a suspended restaurant', async () => {
    const owner = await signUp(t);
    const status = t.app.get(RestaurantStatusService);
    const tenant = asTenantId(restaurantIdOf(owner));
    await expect(status.assertActive(tenant)).resolves.toBeUndefined();
    await act('suspend', restaurantIdOf(owner)).expect(200);
    await expect(status.assertActive(tenant)).rejects.toMatchObject({
      code: 'RESTAURANT_SUSPENDED',
      status: 403,
      detail: 'Nhà hàng tạm ngưng',
    });
    await expect(status.assertActive(asTenantId(MISSING_ID))).rejects.toBeInstanceOf(DomainError);
    await act('reactivate', restaurantIdOf(owner)).expect(200);
    await expect(status.assertActive(tenant)).resolves.toBeUndefined();
  });

  it('answers 404 for an unknown or malformed restaurant id', async () => {
    await act('suspend', MISSING_ID).expect(404);
    await act('reactivate', 'not-a-uuid').expect(404);
  });

  it('refuses owners and staff with 403 and keeps the restaurant active', async () => {
    const owner = await signUp(t);
    const { body } = await addStaff(t, owner.cookie, 'cashier');
    const cashier = await loginCookie(t, body.email, STAFF_PASSWORD);
    for (const cookie of [owner.cookie, cashier]) {
      const refused = await act('suspend', restaurantIdOf(owner), cookie).expect(403);
      expect(refused.body.code).toBe('FORBIDDEN');
      await http().get('/api/admin/restaurants').set('cookie', cookie).expect(403);
    }
    await http().get('/api/me').set('cookie', owner.cookie).expect(200);
  });

  it('a platform admin cannot reach restaurant staff endpoints (no tenant)', async () => {
    await http().get('/api/staff').set('cookie', admin.cookie).expect(403);
  });
});
