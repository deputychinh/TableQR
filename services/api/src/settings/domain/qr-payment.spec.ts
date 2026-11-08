import {
  DEFAULT_RULES,
  type HouseRules,
  houseRulesSchema,
  readStoredRules,
} from './house-rules.js';
import { qrPaymentActive, qrPaymentNeedsBank } from './qr-payment.js';

const BANK = { bin: '970436', accountNumber: '0123456789', accountName: 'NGUYEN VAN ANH' };

const withQr = (qrEnabled: boolean): HouseRules => {
  const copy = structuredClone(DEFAULT_RULES);
  copy.payment.qrEnabled = qrEnabled;
  return copy;
};

describe('TQR-029 QR payment is an option, off by default', () => {
  it('a new restaurant (rules = {}) does not take QR transfers', () => {
    expect(DEFAULT_RULES.payment).toEqual({ qrEnabled: false });
    expect(readStoredRules({}).payment.qrEnabled).toBe(false);
  });

  it('rules saved before the option existed read as off; a stored true stays on', () => {
    expect(readStoredRules({ paymentTiming: 'pay_before' }).payment.qrEnabled).toBe(false);
    expect(readStoredRules({ payment: { qrEnabled: true } }).payment.qrEnabled).toBe(true);
  });

  it('the schema wants a real boolean and no extra keys', () => {
    const valid = (payment: unknown) =>
      houseRulesSchema.safeParse({ ...withQr(false), payment }).success;
    expect(valid({ qrEnabled: 'yes' })).toBe(false);
    expect(valid({})).toBe(false);
    expect(valid({ qrEnabled: true, provider: 'payos' })).toBe(false);
    expect(valid({ qrEnabled: true })).toBe(true);
  });

  it('turning QR on needs a bank account; off needs nothing', () => {
    expect(qrPaymentNeedsBank(withQr(true), null)).toBe(true);
    expect(qrPaymentNeedsBank(withQr(true), BANK)).toBe(false);
    expect(qrPaymentNeedsBank(withQr(false), null)).toBe(false);
    expect(qrPaymentNeedsBank(withQr(false), BANK)).toBe(false);
  });

  it('a bill carries VietQR only when the option is on and an account is stored', () => {
    expect(qrPaymentActive(withQr(true), true)).toBe(true);
    expect(qrPaymentActive(withQr(true), false)).toBe(false);
    // Off wins over a stored account: nobody gets a QR the owner did not ask for.
    expect(qrPaymentActive(withQr(false), true)).toBe(false);
    expect(qrPaymentActive(withQr(false), false)).toBe(false);
  });
});
