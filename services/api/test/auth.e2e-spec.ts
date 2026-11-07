import request from 'supertest';
import { createTestApp, type TestApp } from './support/app.js';
import { ORIGIN, cookieOf, newOwner, signUp } from './support/http.js';

describe('restaurant sign-up and staff sessions (e2e)', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('AC1 signs the owner up, sets a safe cookie and returns their restaurant from /api/me', async () => {
    const { body, response, cookie } = await signUp(t, newOwner('Bún Chả Hà Nội'));
    const setCookie = (response.headers['set-cookie'] as unknown as string[])[0] ?? '';
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Lax/);
    expect(response.body.restaurant.name).toBe(body.restaurantName);
    expect(response.body.restaurant.slug).toMatch(/^bun-cha-ha-noi/);
    const me = await http().get('/api/me').set('cookie', cookie).expect(200);
    expect(me.body).toMatchObject({
      user: { email: body.email.toLowerCase(), role: 'owner' },
      restaurant: { name: body.restaurantName },
    });
    expect(JSON.stringify(me.body)).not.toMatch(/password|hash/i);
  });

  it.each([
    ['name too short', { restaurantName: 'A' }, 'restaurantName'],
    ['name too long', { restaurantName: 'A'.repeat(81) }, 'restaurantName'],
    ['bad email', { email: 'not-an-email' }, 'email'],
    ['password of 9 chars', { password: '123456789' }, 'password'],
    ['unknown field', { role: 'platform_admin' }, '(body)'],
  ])('AC1a rejects %s with 422 and the failing field', async (_label, patch, field) => {
    const response = await http()
      .post('/api/auth/signup')
      .set('origin', ORIGIN)
      .send({ ...newOwner(), ...patch })
      .expect(422);
    expect(response.body.code).toBe('VALIDATION_FAILED');
    expect(response.body.fields.map((f: { path: string }) => f.path)).toContain(field);
  });

  it('AC1a accepts the boundary values (2-char name, 10-char password)', async () => {
    await http()
      .post('/api/auth/signup')
      .set('origin', ORIGIN)
      .send({ ...newOwner(), restaurantName: 'AB', password: '1234567890' })
      .expect(201);
  });

  it('AC2 refuses an email already registered in another letter case', async () => {
    const { body } = await signUp(t);
    const response = await http()
      .post('/api/auth/signup')
      .set('origin', ORIGIN)
      .send({ ...newOwner(), email: body.email.toUpperCase() })
      .expect(409);
    expect(response.body).toMatchObject({ code: 'EMAIL_TAKEN', detail: 'Email đã được dùng' });
  });

  it('AC2a lets exactly one of two simultaneous sign-ups with the same email win', async () => {
    const body = newOwner();
    const results = await Promise.all([
      http().post('/api/auth/signup').set('origin', ORIGIN).send(body),
      http()
        .post('/api/auth/signup')
        .set('origin', ORIGIN)
        .send({ ...body, restaurantName: 'Khác' }),
    ]);
    expect(results.map((r) => r.status).sort((x, y) => x - y)).toEqual([201, 409]);
  });

  it('AC3 /api/me only ever shows the caller’s own restaurant', async () => {
    const a = await signUp(t, newOwner('Quán A'));
    const b = await signUp(t, newOwner('Quán B'));
    const meA = await http().get('/api/me').set('cookie', a.cookie).expect(200);
    const meB = await http().get('/api/me').set('cookie', b.cookie).expect(200);
    expect(meA.body.restaurant.id).not.toBe(meB.body.restaurant.id);
    expect(meA.body.restaurant.name).toBe(a.body.restaurantName);
  });

  it('AC4a answers wrong password and unknown email with the same 401', async () => {
    const { body } = await signUp(t);
    const wrong = await http()
      .post('/api/auth/login')
      .set('origin', ORIGIN)
      .send({ email: body.email, password: 'sai-mat-khau-1' })
      .expect(401);
    const unknown = await http()
      .post('/api/auth/login')
      .set('origin', ORIGIN)
      .send({ email: `nobody-${Date.now()}@example.com`, password: 'sai-mat-khau-1' })
      .expect(401);
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
    const { instance: _a, ...wrongBody } = wrong.body;
    const { instance: _b, ...unknownBody } = unknown.body;
    expect(unknownBody).toEqual(wrongBody);
  });

  it('AC4 blocks the 11th attempt after 10 failures, then lets in after 15 minutes', async () => {
    const { body } = await signUp(t);
    for (let i = 0; i < 10; i += 1) {
      await http()
        .post('/api/auth/login')
        .set('origin', ORIGIN)
        .send({ email: body.email, password: `wrong-${i}-password` })
        .expect(401);
    }
    const blocked = await http()
      .post('/api/auth/login')
      .set('origin', ORIGIN)
      .send({ email: body.email, password: body.password })
      .expect(429);
    expect(blocked.body).toMatchObject({ code: 'LOGIN_BLOCKED', detail: 'Thử lại sau 15 phút' });
    t.clock.advance(15 * 60 * 1000 + 1000);
    const ok = await http()
      .post('/api/auth/login')
      .set('origin', ORIGIN)
      .send({ email: body.email.toUpperCase(), password: body.password })
      .expect(200);
    expect(cookieOf(ok)).toMatch(/^tqr_staff=/);
  });

  it('AC4 counts only failures: 9 failures do not block', async () => {
    const { body } = await signUp(t);
    for (let i = 0; i < 9; i += 1) {
      await http()
        .post('/api/auth/login')
        .set('origin', ORIGIN)
        .send({ email: body.email, password: `wrong-${i}-password` })
        .expect(401);
    }
    await http()
      .post('/api/auth/login')
      .set('origin', ORIGIN)
      .send({ email: body.email, password: body.password })
      .expect(200);
  });

  it('AC5 signs out: the session is gone and the cookie cleared', async () => {
    const { cookie } = await signUp(t);
    const out = await http()
      .post('/api/auth/logout')
      .set('origin', ORIGIN)
      .set('cookie', cookie)
      .expect(204);
    expect(String(out.headers['set-cookie'])).toMatch(/tqr_staff=;/);
    await http().get('/api/me').set('cookie', cookie).expect(401);
  });

  it('AC5 rotates the session on sign-in: the old cookie stops working', async () => {
    const { body, cookie } = await signUp(t);
    await http()
      .post('/api/auth/login')
      .set('origin', ORIGIN)
      .set('cookie', cookie)
      .send({ email: body.email, password: body.password })
      .expect(200);
    await http().get('/api/me').set('cookie', cookie).expect(401);
  });

  it('AC6 refuses a non-GET request from a foreign origin with 403 BAD_ORIGIN', async () => {
    const { cookie } = await signUp(t);
    const response = await http()
      .post('/api/auth/logout')
      .set('origin', 'https://evil.example')
      .set('cookie', cookie)
      .expect(403);
    expect(response.body.code).toBe('BAD_ORIGIN');
    await http().get('/api/me').set('cookie', cookie).expect(200);
  });

  it('AC6 refuses a cross-site request without Origin (Sec-Fetch-Site: cross-site)', async () => {
    await http().post('/api/auth/logout').set('sec-fetch-site', 'cross-site').expect(403);
  });

  it('AC7 answers 401 for an unknown cookie and for an expired session', async () => {
    await http().get('/api/me').set('cookie', 'tqr_staff=not-a-real-token').expect(401);
    await http().get('/api/me').expect(401);
    const { cookie } = await signUp(t);
    t.clock.advance(12 * 60 * 60 * 1000 + 1000);
    await http().get('/api/me').set('cookie', cookie).expect(401);
  });

  it('D3 treats a cookie with malformed percent-encoding as absent (401, not 500)', async () => {
    const response = await http().get('/api/me').set('cookie', 'tqr_staff=%E0%A4%A').expect(401);
    expect(response.body.code).toBe('UNAUTHORIZED');
  });

  it('never logs the email or password of a sign-in', async () => {
    t.logs.length = 0;
    const body = newOwner();
    await signUp(t, body);
    expect(JSON.stringify(t.logs)).not.toContain(body.email);
    expect(JSON.stringify(t.logs)).not.toContain(body.password);
  });
});
