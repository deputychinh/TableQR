import request from 'supertest';
import { createTestApp, type TestApp } from './support/app.js';
import { ORIGIN, newOwner, signUp } from './support/http.js';
import { STAFF_PASSWORD, addStaff, login, loginCookie, uniqueEmail } from './support/staff.js';

describe('staff accounts (e2e, spec S5)', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());
  const patch = (cookie: string, id: string, body: object) =>
    http().patch(`/api/staff/${id}`).set('origin', ORIGIN).set('cookie', cookie).send(body);

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('AC14 the owner adds a kitchen user who can sign in and is a kitchen user', async () => {
    const owner = await signUp(t);
    const { body, member } = await addStaff(t, owner.cookie, 'kitchen', {
      displayName: '  Anh Bếp  ',
      email: uniqueEmail('Bep.Truong'),
    });
    expect(member).toMatchObject({
      displayName: 'Anh Bếp',
      email: body.email.toLowerCase(),
      role: 'kitchen',
      active: true,
    });
    expect(JSON.stringify(member)).not.toMatch(/password|hash/i);
    const signedIn = await login(t, body.email.toUpperCase(), STAFF_PASSWORD).expect(200);
    expect(signedIn.body).toMatchObject({
      user: { role: 'kitchen', displayName: 'Anh Bếp' },
      restaurant: { name: owner.body.restaurantName },
    });
  });

  it.each(['cashier', 'waiter'] as const)(
    'AC14 adds a %s who signs in with that role',
    async (role) => {
      const owner = await signUp(t);
      const { body } = await addStaff(t, owner.cookie, role);
      const me = await login(t, body.email, STAFF_PASSWORD).expect(200);
      expect(me.body.user.role).toBe(role);
    },
  );

  it('AC14 lists the owner and their staff, oldest first, without password hashes', async () => {
    const owner = await signUp(t);
    await addStaff(t, owner.cookie, 'cashier');
    await addStaff(t, owner.cookie, 'waiter');
    const list = await http().get('/api/staff').set('cookie', owner.cookie).expect(200);
    expect(list.body.items.map((m: { role: string }) => m.role)).toEqual([
      'owner',
      'cashier',
      'waiter',
    ]);
    expect(JSON.stringify(list.body)).not.toMatch(/password|hash/i);
  });

  it.each([
    ['empty display name', { displayName: '   ' }, 'displayName'],
    ['61-char display name', { displayName: 'A'.repeat(61) }, 'displayName'],
    ['bad email', { email: 'khong-phai-email' }, 'email'],
    ['9-char password', { password: '123456789' }, 'password'],
    ['owner role (not offered on create)', { role: 'owner' }, 'role'],
    ['platform_admin role', { role: 'platform_admin' }, 'role'],
    ['unknown field', { restaurantId: '00000000-0000-4000-8000-000000000000' }, '(body)'],
  ])('AC14 rejects a %s with 422', async (_label, patchBody, field) => {
    const owner = await signUp(t);
    const response = await http()
      .post('/api/staff')
      .set('origin', ORIGIN)
      .set('cookie', owner.cookie)
      .send({
        displayName: 'An',
        email: uniqueEmail('x'),
        password: STAFF_PASSWORD,
        role: 'waiter',
        ...patchBody,
      })
      .expect(422);
    expect(response.body.fields.map((f: { path: string }) => f.path)).toContain(field);
  });

  it('AC14 accepts the boundary values (1- and 60-char names, 10-char password)', async () => {
    const owner = await signUp(t);
    await addStaff(t, owner.cookie, 'waiter', { displayName: 'A', password: '1234567890' });
    await addStaff(t, owner.cookie, 'waiter', { displayName: 'B'.repeat(60) });
  });

  it('AC14 refuses an email already used anywhere in the system (any letter case) with 409', async () => {
    const other = await signUp(t);
    const owner = await signUp(t);
    const response = await http()
      .post('/api/staff')
      .set('origin', ORIGIN)
      .set('cookie', owner.cookie)
      .send({
        displayName: 'Trùng',
        email: other.body.email.toUpperCase(),
        password: STAFF_PASSWORD,
        role: 'cashier',
      })
      .expect(409);
    expect(response.body).toMatchObject({ code: 'EMAIL_TAKEN', detail: 'Email đã được dùng' });
  });

  it('AC16 disabling a person ends their sessions immediately and blocks sign-in', async () => {
    const owner = await signUp(t);
    const { body, member } = await addStaff(t, owner.cookie, 'kitchen');
    const first = await loginCookie(t, body.email, STAFF_PASSWORD);
    const second = await loginCookie(t, body.email, STAFF_PASSWORD);
    await http().get('/api/me').set('cookie', first).expect(200);

    const disabled = await patch(owner.cookie, member.id, { active: false }).expect(200);
    expect(disabled.body.active).toBe(false);
    await http().get('/api/me').set('cookie', first).expect(401);
    await http().get('/api/me').set('cookie', second).expect(401);
    const refused = await login(t, body.email, STAFF_PASSWORD).expect(401);
    expect(refused.body.code).toBe('INVALID_CREDENTIALS');
    await http().get('/api/me').set('cookie', owner.cookie).expect(200);
  });

  it('AC16 re-enabling lets the person sign in again', async () => {
    const owner = await signUp(t);
    const { body, member } = await addStaff(t, owner.cookie, 'waiter');
    await patch(owner.cookie, member.id, { active: false }).expect(200);
    await patch(owner.cookie, member.id, { active: false }).expect(200); // idempotent
    const enabled = await patch(owner.cookie, member.id, { active: true }).expect(200);
    expect(enabled.body.active).toBe(true);
    await login(t, body.email, STAFF_PASSWORD).expect(200);
  });

  it('AC16 a role change applies to the person’s next request without signing out', async () => {
    const owner = await signUp(t);
    const { body, member } = await addStaff(t, owner.cookie, 'kitchen');
    const cookie = await loginCookie(t, body.email, STAFF_PASSWORD);
    const changed = await patch(owner.cookie, member.id, {
      role: 'cashier',
      displayName: 'Thu Ngân',
    }).expect(200);
    expect(changed.body).toMatchObject({ role: 'cashier', displayName: 'Thu Ngân' });
    const me = await http().get('/api/me').set('cookie', cookie).expect(200);
    expect(me.body.user.role).toBe('cashier');
  });

  it('AC16 the owner sets a new password: old sessions end, only the new password works', async () => {
    const owner = await signUp(t);
    const { body, member } = await addStaff(t, owner.cookie, 'cashier');
    const cookie = await loginCookie(t, body.email, STAFF_PASSWORD);
    await http()
      .put(`/api/staff/${member.id}/password`)
      .set('origin', ORIGIN)
      .set('cookie', owner.cookie)
      .send({ password: 'mat-khau-moi-456' })
      .expect(204);
    await http().get('/api/me').set('cookie', cookie).expect(401);
    await login(t, body.email, STAFF_PASSWORD).expect(401);
    await login(t, body.email, 'mat-khau-moi-456').expect(200);
    await http()
      .put(`/api/staff/${member.id}/password`)
      .set('origin', ORIGIN)
      .set('cookie', owner.cookie)
      .send({ password: 'ngan' })
      .expect(422);
  });

  it('AC16 the owner cannot disable, demote or reset their own account', async () => {
    const owner = await signUp(t);
    const me = await http().get('/api/me').set('cookie', owner.cookie).expect(200);
    const ownId = me.body.user.id as string;
    for (const body of [{ active: false }, { role: 'cashier' }]) {
      const refused = await patch(owner.cookie, ownId, body).expect(409);
      expect(refused.body.code).toBe('CANNOT_CHANGE_SELF');
    }
    await http()
      .put(`/api/staff/${ownId}/password`)
      .set('origin', ORIGIN)
      .set('cookie', owner.cookie)
      .send({ password: 'mat-khau-moi-456' })
      .expect(409);
    const renamed = await patch(owner.cookie, ownId, { displayName: 'Chị Chủ' }).expect(200);
    expect(renamed.body).toMatchObject({ role: 'owner', active: true, displayName: 'Chị Chủ' });
    await http().get('/api/me').set('cookie', owner.cookie).expect(200);
  });

  it('AC16 keeps exactly one active owner when two owners remove each other at once', async () => {
    const owner = await signUp(t);
    const { body, member } = await addStaff(t, owner.cookie, 'waiter');
    await patch(owner.cookie, member.id, { role: 'owner' }).expect(200);
    const second = await loginCookie(t, body.email, STAFF_PASSWORD);
    const me = await http().get('/api/me').set('cookie', owner.cookie).expect(200);

    const results = await Promise.all([
      patch(owner.cookie, member.id, { role: 'waiter' }),
      patch(second, me.body.user.id, { active: false }),
    ]);
    // The restaurant row lock serialises them: the loser is no longer an active owner when its
    // turn comes (401 when its session was ended, 403 otherwise; 409 is the last-owner backstop).
    const statuses = results.map((r) => r.status).sort((x, y) => x - y);
    expect(statuses[0]).toBe(200);
    expect([401, 403, 409]).toContain(statuses[1]);
    const lists = await Promise.all(
      [owner.cookie, second].map((cookie) => http().get('/api/staff').set('cookie', cookie)),
    );
    const winner = lists.filter((list) => list.status === 200);
    expect(winner).toHaveLength(1);
    const [list] = winner;
    const items = (list?.body ?? { items: [] }) as { items: { role: string; active: boolean }[] };
    const owners = items.items.filter((m) => m.role === 'owner' && m.active);
    expect(owners).toHaveLength(1);
  });

  it('AC16 a second owner can disable the first, whose sessions end at once', async () => {
    const owner = await signUp(t);
    const { body, member } = await addStaff(t, owner.cookie, 'waiter');
    await patch(owner.cookie, member.id, { role: 'owner' }).expect(200);
    const second = await loginCookie(t, body.email, STAFF_PASSWORD);
    const me = await http().get('/api/me').set('cookie', owner.cookie).expect(200);
    await patch(second, me.body.user.id, { active: false }).expect(200);
    await http().get('/api/me').set('cookie', owner.cookie).expect(401);
    const demoted = await patch(second, me.body.user.id, { active: true, role: 'cashier' });
    expect(demoted.body).toMatchObject({ role: 'cashier', active: true });
  });

  it('a demoted owner loses owner actions on their next request (403)', async () => {
    const owner = await signUp(t);
    const { body, member } = await addStaff(t, owner.cookie, 'waiter');
    await patch(owner.cookie, member.id, { role: 'owner' }).expect(200);
    const second = await loginCookie(t, body.email, STAFF_PASSWORD);
    await patch(owner.cookie, member.id, { role: 'kitchen' }).expect(200);
    const refused = await http().get('/api/staff').set('cookie', second).expect(403);
    expect(refused.body.code).toBe('FORBIDDEN');
  });

  it('answers 422 for an empty change and 404 for a malformed or unknown id', async () => {
    const owner = await signUp(t);
    const { member } = await addStaff(t, owner.cookie, 'waiter');
    await patch(owner.cookie, member.id, {}).expect(422);
    await patch(owner.cookie, member.id, { active: 'no' }).expect(422);
    await http().get('/api/staff/not-a-uuid').set('cookie', owner.cookie).expect(404);
    await http()
      .get('/api/staff/00000000-0000-4000-8000-000000000000')
      .set('cookie', owner.cookie)
      .expect(404);
    const one = await http().get(`/api/staff/${member.id}`).set('cookie', owner.cookie).expect(200);
    expect(one.body.id).toBe(member.id);
  });

  it('AC3 isolation: owner A cannot see, change or reset B’s staff (404), nor list them', async () => {
    const a = await signUp(t, newOwner('Quán A'));
    const b = await signUp(t, newOwner('Quán B'));
    const { body, member } = await addStaff(t, b.cookie, 'kitchen');
    const bCookie = await loginCookie(t, body.email, STAFF_PASSWORD);

    await http().get(`/api/staff/${member.id}`).set('cookie', a.cookie).expect(404);
    await patch(a.cookie, member.id, { active: false }).expect(404);
    await http()
      .put(`/api/staff/${member.id}/password`)
      .set('origin', ORIGIN)
      .set('cookie', a.cookie)
      .send({ password: 'mat-khau-moi-456' })
      .expect(404);
    const listA = await http().get('/api/staff').set('cookie', a.cookie).expect(200);
    expect(listA.body.items.map((m: { id: string }) => m.id)).not.toContain(member.id);
    await http().get('/api/me').set('cookie', bCookie).expect(200);
    await login(t, body.email, STAFF_PASSWORD).expect(200);
  });

  it('never logs the staff email or password', async () => {
    const owner = await signUp(t);
    t.logs.length = 0;
    const { body } = await addStaff(t, owner.cookie, 'waiter');
    await login(t, body.email, body.password).expect(200);
    expect(JSON.stringify(t.logs)).not.toContain(body.email);
    expect(JSON.stringify(t.logs)).not.toContain(body.password);
  });
});
