import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createTestApp, type TestApp } from './support/app.js';
import { checkIn, joinPhone, line, placeOrder, setupFloor } from './support/guest-floor.js';
import { ORIGIN, signUp } from './support/http.js';

/**
 * docs/security.md (denial of service): throttles on the guest and public write paths. Each limit
 * is lowered for this spec's own app; the others run with the high limits of global-setup.
 */
describe('guest and public throttles (e2e)', () => {
  let t: TestApp;
  const saved = {
    checkIns: process.env.TQR_GUEST_CHECKINS_PER_MINUTE,
    orders: process.env.TQR_GUEST_ORDERS_PER_10_MINUTES,
    bills: process.env.TQR_GUEST_BILL_REQUESTS_PER_MINUTE,
    bookings: process.env.TQR_BOOKINGS_PER_HOUR,
  };
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    process.env.TQR_GUEST_CHECKINS_PER_MINUTE = '4';
    process.env.TQR_GUEST_ORDERS_PER_10_MINUTES = '3';
    process.env.TQR_GUEST_BILL_REQUESTS_PER_MINUTE = '2';
    process.env.TQR_BOOKINGS_PER_HOUR = '2';
    t = await createTestApp();
  });

  afterAll(async () => {
    process.env.TQR_GUEST_CHECKINS_PER_MINUTE = saved.checkIns;
    process.env.TQR_GUEST_ORDERS_PER_10_MINUTES = saved.orders;
    process.env.TQR_GUEST_BILL_REQUESTS_PER_MINUTE = saved.bills;
    process.env.TQR_BOOKINGS_PER_HOUR = saved.bookings;
    await t.app.close();
  });

  it('TQR-012: a phone gets 429 TOO_MANY_ORDERS after its orders per 10 minutes; another phone and the next window still order', async () => {
    t.clock.advance(60 * 60_000);
    const floor = await setupFloor(t, 8);
    const phone = await joinPhone(t, floor, 8);
    const other = await joinPhone(t, floor);
    for (let n = 0; n < 3; n += 1) {
      await placeOrder(t, phone, [line(floor.items.tra)]).expect(201);
    }
    const refused = await placeOrder(t, phone, [line(floor.items.tra)]).expect(429);
    expect(refused.body).toMatchObject({ code: 'TOO_MANY_ORDERS', status: 429 });
    await placeOrder(t, other, [line(floor.items.tra)]).expect(201);
    t.clock.advance(10 * 60_000);
    await placeOrder(t, phone, [line(floor.items.tra)]).expect(201);
  });

  it('TQR-018: a phone gets 429 after its bill requests per minute; the GET view is not limited', async () => {
    t.clock.advance(60 * 60_000);
    const floor = await setupFloor(t, 8);
    const phone = await joinPhone(t, floor, 2);
    await placeOrder(t, phone, [line(floor.items.pho)]).expect(201);
    const bill = () =>
      http().post('/api/g/bill').set('origin', ORIGIN).set('cookie', phone.cookie).send();
    await bill().expect(200);
    await bill().expect(200);
    const refused = await bill().expect(429);
    expect(refused.body.code).toBe('TOO_MANY_REQUESTS');
    await http().get('/api/g/bill').set('cookie', phone.cookie).expect(200);
    t.clock.advance(60_000);
    await bill().expect(200);
  });

  it('TQR-011: check-in answers 429 after its requests per minute from one address', async () => {
    t.clock.advance(60 * 60_000);
    const floor = await setupFloor(t, 8);
    await checkIn(t, floor.qrToken, 2).expect(201);
    for (let n = 0; n < 3; n += 1) await checkIn(t, floor.qrToken).expect(200);
    const refused = await checkIn(t, floor.qrToken).expect(429);
    expect(refused.body.code).toBe('TOO_MANY_REQUESTS');
    t.clock.advance(60_000);
    await checkIn(t, floor.qrToken).expect(200);
  });

  it('TQR-020: public booking answers 429 after its requests per hour from one address', async () => {
    t.clock.advance(2 * 60 * 60_000);
    const { response } = await signUp(t);
    const slug = (response.body.restaurant as { slug: string }).slug;
    const book = () =>
      http()
        .post(`/api/g/r/${slug}/bookings`)
        .set('origin', ORIGIN)
        .set('idempotency-key', randomUUID())
        .send({ date: '2000-01-01', time: '19:00', partySize: 2, name: 'An', phone: '0912345678' });
    for (let n = 0; n < 2; n += 1) {
      const answer = await book();
      expect(answer.status).not.toBe(429);
    }
    const refused = await book().expect(429);
    expect(refused.body.code).toBe('TOO_MANY_REQUESTS');
    t.clock.advance(60 * 60_000);
    expect((await book()).status).not.toBe(429);
  });
});
