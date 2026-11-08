import { readFileSync } from 'node:fs';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { decodeVietQr } from '../src/billing/domain/vietqr.js';
import { DB, type Database } from '../src/db/database.module.js';
import { restaurants } from '../src/db/schema.js';
import { DEFAULT_RULES, type HouseRules } from '../src/settings/domain/house-rules.js';
import { createTestApp, type TestApp } from './support/app.js';
import { addOrder, openSession, seedMenu, type FloorFixture } from './support/floor.js';
import { ORIGIN, OWNER_PASSWORD, signUp } from './support/http.js';
import { STAFF_PASSWORD, addStaff, loginCookie } from './support/staff.js';

const BANK = { bin: '970436', accountNumber: '0123456789', accountName: 'NGUYEN VAN ANH' };

const qr = (qrEnabled: boolean): HouseRules => {
  const rules = structuredClone(DEFAULT_RULES) as HouseRules;
  rules.payment.qrEnabled = qrEnabled;
  return rules;
};

interface Restaurant {
  id: string;
  owner: string;
  cashier: string;
  floor: FloorFixture;
}

describe('TQR-029 QR payment is a per-restaurant option, default off (e2e, real Postgres)', () => {
  let t: TestApp;
  let db: Database;
  const http = () => request(t.app.getHttpServer());
  const put = (cookie: string, body: object) =>
    http()
      .put('/api/restaurant/settings')
      .set('origin', ORIGIN)
      .set('cookie', cookie)
      .send({ currentPassword: OWNER_PASSWORD, ...body });
  const post = (path: string, cookie: string, body?: object) =>
    http().post(path).set('origin', ORIGIN).set('cookie', cookie).send(body);

  const restaurant = async (): Promise<Restaurant> => {
    const owner = await signUp(t);
    const id = owner.response.body.restaurant.id as string;
    const { body } = await addStaff(t, owner.cookie, 'cashier');
    return {
      id,
      owner: owner.cookie,
      cashier: await loginCookie(t, body.email, STAFF_PASSWORD),
      floor: await seedMenu(db, id),
    };
  };

  /** A table with 2 × 45.000 đ served and its guest bill issued. */
  const billOf = async (r: Restaurant) => {
    const session = await openSession(db, r.floor);
    await addOrder(db, r.floor, session, 'released', [{ priceVnd: 45_000, quantity: 2 }]);
    const { body } = await post('/api/g/bill', session.guestCookie).expect(200);
    return { session, body };
  };

  beforeAll(async () => {
    t = await createTestApp();
    db = t.app.get(DB);
  });

  afterAll(async () => {
    await t.app.close();
  });

  describe('settings', () => {
    it('a new restaurant has QR payment off and every role sees it off', async () => {
      const r = await restaurant();
      const settings = await http().get('/api/restaurant/settings').set('cookie', r.owner);
      expect(settings.body.rules.payment).toEqual({ qrEnabled: false });
      const rules = await http().get('/api/restaurant/rules').set('cookie', r.cashier).expect(200);
      expect(rules.body).toMatchObject({ qrEnabled: false, bankConfigured: false });
    });

    it('turning QR on without a bank account is refused with the field to fix; nothing changes', async () => {
      const r = await restaurant();
      const response = await put(r.owner, { rules: qr(true), bank: null }).expect(422);
      expect(response.body.code).toBe('VALIDATION_FAILED');
      expect(response.body.fields).toEqual([{ path: 'bank', code: 'custom' }]);
      const read = await http().get('/api/restaurant/settings').set('cookie', r.owner);
      expect(read.body).toMatchObject({ rules: DEFAULT_RULES, rulesUpdatedAt: null, bank: null });
    });

    it('turning QR on with an account saves both; AC12: the switch is a new rules version', async () => {
      const r = await restaurant();
      const on = await put(r.owner, { rules: qr(true), bank: BANK }).expect(200);
      expect(on.body.rules.payment.qrEnabled).toBe(true);
      expect(on.body.bank).toMatchObject({ accountNumber: BANK.accountNumber });
      const firstVersion = Date.parse(on.body.rulesUpdatedAt as string);
      t.clock.advance(60_000);
      // Off again keeps the stored account (no password needed, nothing about the bank moves).
      const off = await http()
        .put('/api/restaurant/settings')
        .set('origin', ORIGIN)
        .set('cookie', r.owner)
        .send({ rules: qr(false), bank: BANK })
        .expect(200);
      expect(off.body.rules.payment.qrEnabled).toBe(false);
      expect(off.body.bank).toMatchObject({ accountNumber: BANK.accountNumber });
      expect(off.body.bankChangedAt).toBe(on.body.bankChangedAt);
      expect(Date.parse(off.body.rulesUpdatedAt as string)).toBeGreaterThan(firstVersion);
    });

    it('removing the account while QR stays on is refused', async () => {
      const r = await restaurant();
      await put(r.owner, { rules: qr(true), bank: BANK }).expect(200);
      const response = await put(r.owner, { rules: qr(true), bank: null }).expect(422);
      expect(response.body.fields).toEqual([{ path: 'bank', code: 'custom' }]);
      await put(r.owner, { rules: qr(false), bank: null }).expect(200);
    });
  });

  describe('guest bill and cashier', () => {
    it('off, even with an account stored: no VietQR payload, "Thanh toán tại quầy", cashier takes money at the counter', async () => {
      const r = await restaurant();
      await put(r.owner, { rules: qr(false), bank: BANK }).expect(200);
      const { session, body } = await billOf(r);
      expect(body.bill).toMatchObject({ amountVnd: 90_000, status: 'open' });
      expect(body.lines).toHaveLength(1);
      expect(body.transfer).toBeNull();
      expect(body.payAtCounter).toBe(true);
      expect(JSON.stringify(body)).not.toContain(BANK.accountNumber);
      // Staff view of the same bill: no payload either.
      const staffView = await http()
        .get(`/api/sessions/${session.sessionId}/bill`)
        .set('cookie', r.cashier)
        .expect(200);
      expect(staffView.body.transfer).toBeNull();

      const overview = await http().get('/api/bills/overview').set('cookie', r.cashier).expect(200);
      expect(overview.body).toMatchObject({ qrEnabled: false, bankConfigured: true });
      const rules = await http().get('/api/restaurant/rules').set('cookie', r.cashier).expect(200);
      expect(rules.body).toMatchObject({ qrEnabled: false, bankConfigured: true });

      const paid = await post(`/api/bills/${body.bill.id as string}/pay`, r.cashier, {
        method: 'cash',
      }).expect(200);
      expect(paid.body).toMatchObject({ dueVnd: 0, bill: { status: 'paid', method: 'cash' } });
    });

    it('off: a transfer the guest made by hand can still be recorded by staff (decision TQR-029)', async () => {
      const r = await restaurant();
      const { body } = await billOf(r);
      const paid = await post(`/api/bills/${body.bill.id as string}/pay`, r.cashier, {
        method: 'transfer',
      }).expect(200);
      expect(paid.body.bill).toMatchObject({ status: 'paid', method: 'transfer' });
    });

    it('on with an account: the bill carries the VietQR as before; the cashier sees QR on', async () => {
      const r = await restaurant();
      await put(r.owner, { rules: qr(true), bank: BANK }).expect(200);
      const { session, body } = await billOf(r);
      expect(body.payAtCounter).toBe(false);
      expect(decodeVietQr(body.transfer.payload as string)).toMatchObject({
        bin: BANK.bin,
        accountNumber: BANK.accountNumber,
        amountVnd: 90_000,
        memo: `TQR ${body.bill.code as string}`,
        crcValid: true,
      });
      const overview = await http().get('/api/bills/overview').set('cookie', r.cashier).expect(200);
      expect(overview.body).toMatchObject({ qrEnabled: true, bankConfigured: true });

      // Turned off later: the same open bill loses its QR at once.
      await http()
        .put('/api/restaurant/settings')
        .set('origin', ORIGIN)
        .set('cookie', r.owner)
        .send({ rules: qr(false), bank: BANK })
        .expect(200);
      const after = await http().get('/api/g/bill').set('cookie', session.guestCookie).expect(200);
      expect(after.body.bill.id).toBe(body.bill.id);
      expect(after.body).toMatchObject({ transfer: null, payAtCounter: true });
    });
  });

  describe('migration 0009: restaurants with an account saved before TQR-029 keep QR on', () => {
    const migration = readFileSync(
      new URL('../drizzle/0009_qr_payment_option.sql', import.meta.url),
      'utf8',
    );

    it('sets qrEnabled where an account exists, leaves the others and the rules version alone', async () => {
      const withBank = await restaurant();
      const withoutBank = await restaurant();
      // As a pre-TQR-029 row: an account, and rules that know nothing about `payment`.
      await db
        .update(restaurants)
        .set({
          rules: { paymentTiming: 'pay_before' },
          bankBin: BANK.bin,
          bankAccount: BANK.accountNumber,
          bankAccountName: BANK.accountName,
        })
        .where(eq(restaurants.id, withBank.id));
      // The migration's own statement, limited to this spec's rows (other specs share the database).
      const scoped = migration
        .trim()
        .replace(/;$/, ` AND "id" IN ('${withBank.id}', '${withoutBank.id}');`);
      expect(scoped).toContain('WHERE "bank_bin" IS NOT NULL AND "id" IN');
      await db.execute(sql.raw(scoped));

      const read = async (id: string) =>
        (await db.select().from(restaurants).where(eq(restaurants.id, id)))[0];
      const migrated = await read(withBank.id);
      expect(migrated?.rules).toEqual({
        paymentTiming: 'pay_before',
        payment: { qrEnabled: true },
      });
      expect(migrated?.rulesUpdatedAt).toBeNull();
      expect((await read(withoutBank.id))?.rules).toEqual({});

      const { body } = await billOf(withBank);
      expect(body.transfer).not.toBeNull();
    });
  });
});
