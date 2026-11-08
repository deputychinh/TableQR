import request from 'supertest';
import { DB, type Database } from '../src/db/database.module.js';
import { and, eq } from 'drizzle-orm';
import { loginAttempts, users } from '../src/db/schema.js';
import { hashPassword } from '../src/identity/domain/password.js';
import { DEFAULT_RULES, type HouseRules } from '../src/settings/domain/house-rules.js';
import { createTestApp, type TestApp } from './support/app.js';
import { ORIGIN, OWNER_PASSWORD, cookieOf, signUp } from './support/http.js';

const BANK = { bin: '970436', accountNumber: '0123456789', accountName: 'Nguyễn Văn Ánh' };

const rulesWith = (patch: (r: HouseRules) => void): HouseRules => {
  const copy = structuredClone(DEFAULT_RULES);
  patch(copy);
  return copy;
};

describe('house rules and bank account settings (e2e)', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());
  /** Sends the owner's current password unless the body says otherwise (step-up, TQR-023). */
  const put = (cookie: string, body: object) =>
    http()
      .put('/api/restaurant/settings')
      .set('origin', ORIGIN)
      .set('cookie', cookie)
      .send({ currentPassword: OWNER_PASSWORD, ...body });
  const putRaw = (cookie: string, body: object) =>
    http().put('/api/restaurant/settings').set('origin', ORIGIN).set('cookie', cookie).send(body);

  /** Staff accounts arrive with TQR-005; until then the test inserts them next to the owner. */
  const staffOf = async (restaurantId: string, role: 'cashier' | 'waiter' | 'kitchen') => {
    const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
    const password = 'mat-khau-nhan-vien';
    await t.app
      .get<symbol, Database>(DB)
      .insert(users)
      .values({ restaurantId, email, passwordHash: await hashPassword(password), role });
    const login = await http()
      .post('/api/auth/login')
      .set('origin', ORIGIN)
      .send({ email, password })
      .expect(200);
    return cookieOf(login);
  };

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('a new restaurant runs on the default rules with no bank account', async () => {
    const { cookie } = await signUp(t);
    const response = await http().get('/api/restaurant/settings').set('cookie', cookie).expect(200);
    expect(response.body).toMatchObject({
      rules: DEFAULT_RULES,
      rulesUpdatedAt: null,
      bank: null,
      bankChangedAt: null,
    });
    expect(response.body.banks).toHaveLength(20);
    expect(response.body.banks[0]).toEqual({
      bin: '970436',
      shortName: 'Vietcombank',
      name: 'Ngân hàng TMCP Ngoại thương Việt Nam',
    });
  });

  it('the owner saves rules and a bank account; the name is stored as the bank shows it', async () => {
    const { cookie } = await signUp(t);
    const rules = rulesWith((r) => {
      r.paymentTiming = 'pay_before';
      r.orderApproval = 'every_order';
      r.anomaly = { maxMainPerPerson: 2.5, minMainPerPerson: 0 };
      r.booking.slotMinutes = 120;
      r.booking.openingHours.mon = { closed: true, open: '10:00', close: '22:00' };
    });
    const saved = await put(cookie, { rules, bank: BANK }).expect(200);
    expect(saved.body.rules).toEqual(rules);
    expect(saved.body.bank).toEqual({
      bin: '970436',
      bankName: 'Vietcombank',
      accountNumber: '0123456789',
      accountName: 'NGUYEN VAN ANH',
    });
    expect(Date.parse(saved.body.rulesUpdatedAt)).not.toBeNaN();
    expect(Date.parse(saved.body.bankChangedAt)).not.toBeNaN();
    const read = await http().get('/api/restaurant/settings').set('cookie', cookie).expect(200);
    expect(read.body).toEqual(saved.body);
  });

  it('saving the same values again creates no new rules version and no bank change', async () => {
    const { cookie } = await signUp(t);
    const rules = rulesWith((r) => (r.sessionOpening = 'staff_opens'));
    const first = await put(cookie, { rules, bank: BANK }).expect(200);
    t.clock.advance(60_000);
    const again = await put(cookie, { rules, bank: { ...BANK, accountName: 'NGUYEN VAN ANH' } });
    expect(again.status).toBe(200);
    expect(again.body.rulesUpdatedAt).toBe(first.body.rulesUpdatedAt);
    expect(again.body.bankChangedAt).toBe(first.body.bankChangedAt);
  });

  it('AC12 a rule change gets a new version time; the bank time moves only with the bank', async () => {
    const { cookie } = await signUp(t);
    const first = await put(cookie, {
      rules: rulesWith((r) => (r.booking.slotMinutes = 60)),
      bank: BANK,
    }).expect(200);
    t.clock.advance(60_000);
    const changed = await put(cookie, {
      rules: rulesWith((r) => (r.paymentTiming = 'pay_before')),
      bank: BANK,
    }).expect(200);
    expect(Date.parse(changed.body.rulesUpdatedAt)).toBeGreaterThan(
      Date.parse(first.body.rulesUpdatedAt),
    );
    expect(changed.body.bankChangedAt).toBe(first.body.bankChangedAt);
  });

  it('the owner can remove the bank account (bills then say "Thanh toán tại quầy")', async () => {
    const { cookie } = await signUp(t);
    await put(cookie, { rules: DEFAULT_RULES, bank: BANK }).expect(200);
    const removed = await put(cookie, { rules: DEFAULT_RULES, bank: null }).expect(200);
    expect(removed.body.bank).toBeNull();
    expect(removed.body.bankChangedAt).not.toBeNull();
  });

  it.each([
    ['an unknown top-level field', { lateMinutes: 10 }, '(body)'],
    ['a missing bank key', { bank: undefined }, 'bank'],
    ['an unknown rules field', { rules: { ...DEFAULT_RULES, tips: true } }, 'rules'],
    ['an unknown bank field', { bank: { ...BANK, branch: 'Hà Nội' } }, 'bank'],
    ['a BIN outside the list', { bank: { ...BANK, bin: '970499' } }, 'bank.bin'],
    [
      'a 5-digit account number',
      { bank: { ...BANK, accountNumber: '12345' } },
      'bank.accountNumber',
    ],
    [
      'a 20-digit account number',
      { bank: { ...BANK, accountNumber: '1'.repeat(20) } },
      'bank.accountNumber',
    ],
    [
      'letters in the account number',
      { bank: { ...BANK, accountNumber: '01234a678' } },
      'bank.accountNumber',
    ],
    ['a 51-character name', { bank: { ...BANK, accountName: 'A'.repeat(51) } }, 'bank.accountName'],
    ['a name with symbols', { bank: { ...BANK, accountName: 'Ánh @ quán' } }, 'bank.accountName'],
    [
      'max portions above 10',
      { rules: rulesWith((r) => (r.anomaly.maxMainPerPerson = 10.5)) },
      'rules.anomaly.maxMainPerPerson',
    ],
    [
      'portions off the half step',
      { rules: rulesWith((r) => (r.anomaly.minMainPerPerson = 0.25)) },
      'rules.anomaly.minMainPerPerson',
    ],
    [
      'a 20-minute slot',
      { rules: rulesWith((r) => (r.booking.slotMinutes = 20)) },
      'rules.booking.slotMinutes',
    ],
    [
      'closing before opening',
      {
        rules: rulesWith(
          (r) => (r.booking.openingHours.wed = { closed: false, open: '22:00', close: '10:00' }),
        ),
      },
      'rules.booking.openingHours.wed.close',
    ],
    [
      'an unknown payment timing',
      { rules: { ...DEFAULT_RULES, paymentTiming: 'later' } },
      'rules.paymentTiming',
    ],
  ])('rejects %s with 422 and the failing field; nothing changes', async (_label, patch, field) => {
    const { cookie } = await signUp(t);
    const response = await put(cookie, { rules: DEFAULT_RULES, bank: BANK, ...patch }).expect(422);
    expect(response.body.code).toBe('VALIDATION_FAILED');
    expect(response.body.fields.map((f: { path: string }) => f.path)).toContain(field);
    const read = await http().get('/api/restaurant/settings').set('cookie', cookie).expect(200);
    expect(read.body).toMatchObject({ rules: DEFAULT_RULES, bank: null, rulesUpdatedAt: null });
  });

  it('accepts the boundaries: 6- and 19-digit numbers, a 50-character name, 2-character name', async () => {
    const { cookie } = await signUp(t);
    for (const bank of [
      { ...BANK, accountNumber: '123456', accountName: 'A'.repeat(50) },
      { ...BANK, accountNumber: '1'.repeat(19), accountName: 'An' },
    ]) {
      await put(cookie, { rules: DEFAULT_RULES, bank }).expect(200);
    }
  });

  it.each(['cashier', 'waiter', 'kitchen'] as const)(
    'a %s cannot read or change the bank account (403) but reads the rules',
    async (role) => {
      const { cookie: ownerCookie, response } = await signUp(t);
      await put(ownerCookie, {
        rules: rulesWith((r) => (r.paymentTiming = 'pay_before')),
        bank: BANK,
      }).expect(200);
      const cookie = await staffOf(response.body.restaurant.id as string, role);
      const read = await http().get('/api/restaurant/settings').set('cookie', cookie).expect(403);
      expect(read.body.code).toBe('FORBIDDEN');
      expect(JSON.stringify(read.body)).not.toContain('0123456789');
      const write = await put(cookie, { rules: DEFAULT_RULES, bank: null }).expect(403);
      expect(write.body.code).toBe('FORBIDDEN');
      const rules = await http().get('/api/restaurant/rules').set('cookie', cookie).expect(200);
      expect(rules.body.rules.paymentTiming).toBe('pay_before');
      expect(rules.body.bankConfigured).toBe(true);
      expect(Date.parse(rules.body.bankChangedAt)).not.toBeNaN();
      expect(JSON.stringify(rules.body)).not.toMatch(/0123456789|NGUYEN|970436|accountNumber/);
      const owner = await http().get('/api/restaurant/settings').set('cookie', ownerCookie);
      expect(owner.body.bank.accountNumber).toBe('0123456789');
    },
  );

  it('without a session every settings endpoint answers 401', async () => {
    await http().get('/api/restaurant/settings').expect(401);
    await http().get('/api/restaurant/rules').expect(401);
    await http()
      .put('/api/restaurant/settings')
      .set('origin', ORIGIN)
      .send({ rules: DEFAULT_RULES, bank: null })
      .expect(401);
  });

  it('refuses a settings change from a foreign origin (CSRF)', async () => {
    const { cookie } = await signUp(t);
    await http()
      .put('/api/restaurant/settings')
      .set('origin', 'https://evil.example')
      .set('cookie', cookie)
      .send({ rules: DEFAULT_RULES, bank: BANK })
      .expect(403);
    const read = await http().get('/api/restaurant/settings').set('cookie', cookie).expect(200);
    expect(read.body.bank).toBeNull();
  });

  it('tenant isolation: one owner’s change never shows in another restaurant', async () => {
    const a = await signUp(t);
    const b = await signUp(t);
    await put(a.cookie, {
      rules: rulesWith((r) => (r.orderApproval = 'none')),
      bank: BANK,
    }).expect(200);
    const readB = await http().get('/api/restaurant/settings').set('cookie', b.cookie).expect(200);
    expect(readB.body).toMatchObject({ rules: DEFAULT_RULES, bank: null });
    const rulesB = await http().get('/api/restaurant/rules').set('cookie', b.cookie).expect(200);
    expect(rulesB.body).toMatchObject({ rules: DEFAULT_RULES, bankConfigured: false });
  });

  it('a bank change writes one audit line with who and when, never the full account number', async () => {
    const { cookie } = await signUp(t);
    const me = await http().get('/api/me').set('cookie', cookie).expect(200);
    const before = t.logs.length;
    await put(cookie, { rules: DEFAULT_RULES, bank: BANK }).expect(200);
    await put(cookie, { rules: DEFAULT_RULES, bank: { ...BANK, accountNumber: '9876543210' } });
    await put(cookie, {
      rules: rulesWith((r) => (r.booking.enabled = false)),
      bank: { ...BANK, accountNumber: '9876543210' },
    });
    const written = t.logs.slice(before);
    const audit = written.filter((entry) => entry.msg === 'bank_account_changed');
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({
      restaurantId: me.body.restaurant.id,
      byUserId: me.body.user.id,
      fromAccountLast3: null,
      toBin: '970436',
      toAccountLast3: '***789',
    });
    expect(audit[1]).toMatchObject({ fromAccountLast3: '***789', toAccountLast3: '***210' });
    expect(typeof audit[0]?.at).toBe('string');
    const everything = JSON.stringify(written);
    expect(everything).not.toContain('0123456789');
    expect(everything).not.toContain('9876543210');
    expect(everything).not.toContain('NGUYEN');
  });
  describe('step-up: the current password guards bank account changes (TQR-023)', () => {
    const failuresOf = async (email: string) =>
      (
        await t.app
          .get<symbol, Database>(DB)
          .select()
          .from(loginAttempts)
          .where(and(eq(loginAttempts.email, email), eq(loginAttempts.succeeded, false)))
      ).length;
    const settingsOf = async (cookie: string) =>
      (await http().get('/api/restaurant/settings').set('cookie', cookie).expect(200)).body;

    it('a new bank account without the password → 422 REAUTH_REQUIRED; nothing changes', async () => {
      const { cookie } = await signUp(t);
      const refused = await putRaw(cookie, { rules: DEFAULT_RULES, bank: BANK }).expect(422);
      expect(refused.body).toMatchObject({
        code: 'REAUTH_REQUIRED',
        fields: [{ path: 'currentPassword', code: 'required' }],
      });
      expect(await settingsOf(cookie)).toMatchObject({ bank: null, bankChangedAt: null });
    });

    it('removing the bank account needs the password too', async () => {
      const { cookie } = await signUp(t);
      await put(cookie, { rules: DEFAULT_RULES, bank: BANK }).expect(200);
      const refused = await putRaw(cookie, { rules: DEFAULT_RULES, bank: null }).expect(422);
      expect(refused.body.code).toBe('REAUTH_REQUIRED');
      expect((await settingsOf(cookie)).bank.accountNumber).toBe('0123456789');
    });

    it('an empty password is a validation error, not a password check', async () => {
      const { cookie, body } = await signUp(t);
      const refused = await putRaw(cookie, {
        rules: DEFAULT_RULES,
        bank: BANK,
        currentPassword: '',
      }).expect(422);
      expect(refused.body.code).toBe('VALIDATION_FAILED');
      expect(await failuresOf(body.email)).toBe(0);
    });

    it('a wrong password → 403 REAUTH_FAILED, counted as a failed sign-in; nothing changes', async () => {
      const { cookie, body } = await signUp(t);
      const refused = await putRaw(cookie, {
        rules: rulesWith((r) => (r.paymentTiming = 'pay_before')),
        bank: BANK,
        currentPassword: 'sai-mat-khau-1',
      }).expect(403);
      expect(refused.body.code).toBe('REAUTH_FAILED');
      expect(await failuresOf(body.email)).toBe(1);
      expect(await settingsOf(cookie)).toMatchObject({
        rules: DEFAULT_RULES,
        bank: null,
        rulesUpdatedAt: null,
      });
      // The session is still good: the owner keeps working.
      await http().get('/api/me').set('cookie', cookie).expect(200);
    });

    it('the right password → 200; the attempt is recorded as a success', async () => {
      const { cookie, body } = await signUp(t);
      const saved = await putRaw(cookie, {
        rules: DEFAULT_RULES,
        bank: BANK,
        currentPassword: OWNER_PASSWORD,
      }).expect(200);
      expect(saved.body.bank.accountNumber).toBe('0123456789');
      expect(await failuresOf(body.email)).toBe(0);
    });

    it('rules-only changes and re-sending the same account need no password', async () => {
      const { cookie, body } = await signUp(t);
      await put(cookie, { rules: DEFAULT_RULES, bank: BANK }).expect(200);
      const rules = rulesWith((r) => (r.orderApproval = 'none'));
      const saved = await putRaw(cookie, { rules, bank: BANK }).expect(200);
      expect(saved.body.rules).toEqual(rules);
      // No password check ran for the rules-only save.
      expect(await failuresOf(body.email)).toBe(0);
    });

    it('10 wrong passwords → 429 LOGIN_BLOCKED, here and at sign-in, even with the right one', async () => {
      const { cookie, body } = await signUp(t);
      for (let i = 0; i < 10; i += 1) {
        await putRaw(cookie, {
          rules: DEFAULT_RULES,
          bank: BANK,
          currentPassword: `sai-mat-khau-${i}`,
        }).expect(403);
      }
      const blocked = await putRaw(cookie, {
        rules: DEFAULT_RULES,
        bank: BANK,
        currentPassword: OWNER_PASSWORD,
      }).expect(429);
      expect(blocked.body.code).toBe('LOGIN_BLOCKED');
      const login = await http()
        .post('/api/auth/login')
        .set('origin', ORIGIN)
        .send({ email: body.email, password: OWNER_PASSWORD })
        .expect(429);
      expect(login.body.code).toBe('LOGIN_BLOCKED');
      expect((await settingsOf(cookie)).bank).toBeNull();
      // The window passes (AC4: 15 minutes) and the right password works again.
      t.clock.advance(15 * 60 * 1000 + 1);
      await put(cookie, { rules: DEFAULT_RULES, bank: BANK }).expect(200);
    });

    it('wrong sign-ins count against the step-up as well (one throttle per email)', async () => {
      const { cookie, body } = await signUp(t);
      for (let i = 0; i < 10; i += 1) {
        await http()
          .post('/api/auth/login')
          .set('origin', ORIGIN)
          .send({ email: body.email, password: `sai-${i}-mat-khau` })
          .expect(401);
      }
      const blocked = await put(cookie, { rules: DEFAULT_RULES, bank: BANK }).expect(429);
      expect(blocked.body.code).toBe('LOGIN_BLOCKED');
    });

    it('the audit line and the logs never hold the password', async () => {
      const { cookie } = await signUp(t);
      const before = t.logs.length;
      await putRaw(cookie, { rules: DEFAULT_RULES, bank: BANK, currentPassword: 'sai-mat-khau-1' });
      await put(cookie, { rules: DEFAULT_RULES, bank: BANK }).expect(200);
      const written = t.logs.slice(before);
      expect(written.filter((entry) => entry.msg === 'bank_account_changed')).toHaveLength(1);
      const everything = JSON.stringify(written);
      expect(everything).not.toContain(OWNER_PASSWORD);
      expect(everything).not.toContain('sai-mat-khau-1');
      expect(everything).not.toContain('0123456789');
    });
  });
});
