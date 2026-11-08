import {
  BILL_CODE_ALPHABET,
  BILL_CODE_LENGTH,
  billMemo,
  newBillCode,
  normalizeBillCode,
} from './bill-code.js';
import {
  BANK_CHANGE_WARNING_MS,
  closeNeedsReason,
  isBankChangeRecent,
  payerName,
} from './cashier-rules.js';
import { crc16CcittFalse, crc16Hex } from './crc16.js';
import { amountDue, decideBill, isBillable, sessionTotal, type BillableLine } from './totals.js';
import {
  AMOUNT_MAX,
  VietQrInputError,
  buildVietQr,
  decodeVietQr,
  parseTlv,
  tlv,
} from './vietqr.js';

/**
 * Known-good payloads published by open-source VietQR libraries (checked 2026-11-08):
 * - liopay/vietqr (PHP) README "Quick Start", QRIBFTBuilder example —
 *   https://packagist.org/packages/liopay/vietqr (repo github.com/liopayvn/vietqr-php)
 * - vietqr_generator (Dart) README "Getting Started" —
 *   https://pub.dev/packages/vietqr_generator (repo github.com/huongrealest/vietqr)
 * Our encoder must reproduce both byte for byte, CRC included.
 */
const PUBLISHED_VECTORS = [
  {
    source: 'liopay/vietqr README',
    input: {
      bin: '970436',
      accountNumber: '1017595600',
      amountVnd: 180_000,
      memo: 'thanh toan don hang',
    },
    payload:
      '00020101021238540010A00000072701240006970436011010175956000208QRIBFTTA530370454061800005802VN62230819thanh toan don hang630470FA',
  },
  {
    source: 'vietqr_generator README',
    input: {
      bin: '970407',
      accountNumber: '0386577672',
      amountVnd: 1_000_000,
      memo: 'henry an cut',
      initiation: 'static' as const,
    },
    payload:
      '00020101021138540010A00000072701240006970407011003865776720208QRIBFTTA5303704540710000005802VN62160812henry an cut6304A322',
  },
];

describe('CRC-16/CCITT-FALSE', () => {
  it('matches the catalogue check value for "123456789" (0x29B1)', () => {
    expect(crc16CcittFalse('123456789')).toBe(0x29b1);
  });

  it('is 0xFFFF (the initial value) for an empty string, written as 4 hex digits', () => {
    expect(crc16CcittFalse('')).toBe(0xffff);
    expect(crc16Hex('')).toBe('FFFF');
  });

  it('pads small values to 4 upper-case hex digits', () => {
    expect(crc16Hex('123456789')).toBe('29B1');
    expect(crc16Hex('A')).toMatch(/^[0-9A-F]{4}$/);
  });

  it('writes a CRC below 0x1000 with leading zeros: 0x00AF → "00AF" (a real bill payload)', () => {
    // Found by search: 369 000 VND, memo "TQR 7F3K2" has CRC 0x00AF. A 3-digit pad would print
    // "0AF" and banks would refuse the code.
    const payload = buildVietQr({
      bin: '970436',
      accountNumber: '0123456789',
      amountVnd: 369_000,
      memo: billMemo('7F3K2'),
    });
    expect(crc16CcittFalse(payload.slice(0, -4))).toBe(0x00af);
    expect(payload).toBe(
      '00020101021238540010A00000072701240006970436011001234567890208QRIBFTTA530370454063690005802VN62130809TQR 7F3K2630400AF',
    );
    expect(payload.endsWith('630400AF')).toBe(true);
    expect(decodeVietQr(payload)).toMatchObject({ crc: '00AF', crcValid: true });
  });
});

describe('VietQR payload (ADR 0006, AC43)', () => {
  it.each(PUBLISHED_VECTORS)(
    'reproduces the published vector from $source',
    ({ input, payload }) => {
      expect(buildVietQr(input)).toBe(payload);
    },
  );

  it.each(PUBLISHED_VECTORS)(
    'decodes the published vector from $source with a valid CRC',
    ({ input, payload }) => {
      const decoded = decodeVietQr(payload);
      expect(decoded).toMatchObject({
        aid: 'A000000727',
        service: 'QRIBFTTA',
        bin: input.bin,
        accountNumber: input.accountNumber,
        amountVnd: input.amountVnd,
        memo: input.memo,
        currency: '704',
        country: 'VN',
        crcValid: true,
      });
    },
  );

  it('builds a dynamic code (01=12) with the bill memo, fields in ADR order', () => {
    const payload = buildVietQr({
      bin: '970436',
      accountNumber: '0123456789',
      amountVnd: 245_000,
      memo: billMemo('7F3K2'),
    });
    expect(payload.startsWith('000201010212')).toBe(true);
    expect([...parseTlv(payload).keys()]).toEqual(['00', '01', '38', '53', '54', '58', '62', '63']);
    expect(decodeVietQr(payload)).toMatchObject({
      initiation: 'dynamic',
      bin: '970436',
      accountNumber: '0123456789',
      amountVnd: 245_000,
      memo: 'TQR 7F3K2',
      crcValid: true,
    });
  });

  it.each([1_000, 100_000_000, AMOUNT_MAX])('round-trips the boundary amount %d', (amountVnd) => {
    const payload = buildVietQr({
      bin: '970422',
      accountNumber: '123456',
      amountVnd,
      memo: 'TQR ABCDE',
    });
    expect(decodeVietQr(payload).amountVnd).toBe(amountVnd);
    expect(parseTlv(payload).get('54')).toBe(String(amountVnd));
  });

  it('caps the amount at 13 digits and refuses zero, negatives and fractions', () => {
    expect(String(AMOUNT_MAX)).toHaveLength(13);
    for (const amountVnd of [0, -1, 1.5, AMOUNT_MAX + 1, Number.NaN]) {
      expect(() =>
        buildVietQr({ bin: '970422', accountNumber: '123456', amountVnd, memo: 'TQR ABCDE' }),
      ).toThrow(VietQrInputError);
    }
  });

  it('refuses a malformed BIN, account or memo instead of printing a code banks reject', () => {
    const ok = { bin: '970422', accountNumber: '123456', amountVnd: 1000, memo: 'TQR ABCDE' };
    expect(() => buildVietQr({ ...ok, bin: '97042' })).toThrow(/bin/);
    expect(() => buildVietQr({ ...ok, accountNumber: '' })).toThrow(/accountNumber/);
    expect(() => buildVietQr({ ...ok, accountNumber: '1'.repeat(20) })).toThrow(/accountNumber/);
    expect(() => buildVietQr({ ...ok, memo: 'x'.repeat(26) })).toThrow(/memo/);
    expect(() => buildVietQr({ ...ok, memo: 'Bàn 1' })).toThrow(/memo/);
    expect(() => buildVietQr({ ...ok, memo: '' })).toThrow(/memo/);
  });

  it('accepts a 19-character account and a 25-character memo (upper bounds)', () => {
    const payload = buildVietQr({
      bin: '970422',
      accountNumber: '1'.repeat(19),
      amountVnd: 1000,
      memo: 'A'.repeat(25),
    });
    expect(decodeVietQr(payload)).toMatchObject({
      accountNumber: '1'.repeat(19),
      memo: 'A'.repeat(25),
    });
  });

  it('detects a tampered payload through the CRC', () => {
    const payload = buildVietQr({
      bin: '970436',
      accountNumber: '0123456789',
      amountVnd: 50_000,
      memo: 'TQR 7F3K2',
    });
    const tampered = payload.replace('540550000', '540510000');
    expect(tampered).not.toBe(payload);
    expect(decodeVietQr(tampered).crcValid).toBe(false);
  });

  it('rejects truncated or malformed TLV and a CRC that is not last', () => {
    expect(() => parseTlv('0002')).toThrow(SyntaxError);
    expect(() => parseTlv('0x02')).toThrow(SyntaxError);
    expect(() => decodeVietQr('000201')).toThrow(/missing tag 63/);
    expect(() => decodeVietQr('63041234000201')).toThrow(/CRC must be last/);
  });

  it('decodes a payload without amount or memo as nulls', () => {
    const body = `${tlv('00', '01')}${tlv('01', '11')}${tlv('38', tlv('00', 'A000000727') + tlv('01', tlv('00', '970436') + tlv('01', '123456')) + tlv('02', 'QRIBFTTA'))}${tlv('53', '704')}${tlv('58', 'VN')}6304`;
    const decoded = decodeVietQr(body + crc16Hex(body));
    expect(decoded).toMatchObject({
      amountVnd: null,
      memo: null,
      initiation: 'static',
      crcValid: true,
    });
  });

  it('refuses an empty or over-long TLV value', () => {
    expect(() => tlv('01', '')).toThrow(RangeError);
    expect(() => tlv('01', 'x'.repeat(100))).toThrow(RangeError);
  });
});

describe('bill code', () => {
  it('uses only the Crockford alphabet (no I, L, O, U) and 5 characters', () => {
    expect(BILL_CODE_ALPHABET).toHaveLength(32);
    expect(BILL_CODE_ALPHABET).not.toMatch(/[ILOU]/);
    for (let i = 0; i < 200; i += 1) expect(newBillCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}$/);
    expect(BILL_CODE_LENGTH).toBe(5);
  });

  it('maps the picker onto the alphabet (first and last symbol)', () => {
    expect(newBillCode(() => 0)).toBe('00000');
    expect(newBillCode((n) => n - 1)).toBe('ZZZZZ');
  });

  it('normalises what a person types: case, O→0, I/L→1, spaces and hyphens', () => {
    expect(normalizeBillCode('7f3k2')).toBe('7F3K2');
    expect(normalizeBillCode('o-il 2z')).toBe('0112Z');
    expect(normalizeBillCode('7F3K')).toBeUndefined();
    expect(normalizeBillCode('7F3KU')).toBeUndefined();
  });

  it('builds the memo "TQR <code>"', () => {
    expect(billMemo('7F3K2')).toBe('TQR 7F3K2');
  });
});

describe('session totals', () => {
  const line = (over: Partial<BillableLine> = {}): BillableLine => ({
    orderStatus: 'released',
    itemStatus: 'served',
    priceVnd: 50_000,
    quantity: 2,
    ...over,
  });

  it('sums released and awaiting-payment lines that are not cancelled', () => {
    expect(
      sessionTotal([
        line(),
        line({
          orderStatus: 'awaiting_payment',
          itemStatus: 'pending',
          priceVnd: 30_000,
          quantity: 1,
        }),
        line({ itemStatus: 'cancelled' }),
        line({ orderStatus: 'held', itemStatus: 'pending' }),
        line({ orderStatus: 'rejected', itemStatus: 'cancelled' }),
        line({ orderStatus: 'cancelled' }),
      ]),
    ).toBe(130_000);
  });

  it('is zero for no lines and flags billable lines', () => {
    expect(sessionTotal([])).toBe(0);
    expect(isBillable(line({ orderStatus: 'held' }))).toBe(false);
  });

  it('never owes a negative amount', () => {
    expect(amountDue(100_000, 40_000)).toBe(60_000);
    expect(amountDue(100_000, 120_000)).toBe(0);
  });

  it('AC42: reuses an open bill of the same amount, supersedes on change, none when nothing is due', () => {
    expect(decideBill(100_000, null)).toEqual({ supersede: false, issue: true });
    expect(decideBill(100_000, 100_000)).toEqual({ supersede: false, issue: false });
    expect(decideBill(150_000, 100_000)).toEqual({ supersede: true, issue: true });
    expect(decideBill(0, 100_000)).toEqual({ supersede: true, issue: false });
    expect(decideBill(0, null)).toEqual({ supersede: false, issue: false });
  });
});

describe('cashier rules', () => {
  const now = new Date('2026-11-08T12:00:00Z');

  it('warns about a bank change for 24 hours, not before or after', () => {
    expect(isBankChangeRecent(null, now)).toBe(false);
    expect(isBankChangeRecent(new Date(now.getTime() - 1000), now)).toBe(true);
    expect(isBankChangeRecent(new Date(now.getTime() - BANK_CHANGE_WARNING_MS + 1), now)).toBe(
      true,
    );
    expect(isBankChangeRecent(new Date(now.getTime() - BANK_CHANGE_WARNING_MS), now)).toBe(false);
    expect(isBankChangeRecent(new Date(now.getTime() + 60_000), now)).toBe(false);
  });

  it('TQR-019: names the payer by display name, else "Chủ quán" for the owner, else the email local part', () => {
    expect(payerName('Lan', 'lan@x.vn', 'cashier')).toBe('Lan');
    expect(payerName('', 'chu@x.vn', 'owner')).toBe('Chủ quán');
    expect(payerName('  ', 'thu.ngan@quan.vn', 'cashier')).toBe('thu.ngan');
    expect(payerName(null, null, null)).toBeNull();
  });

  it('AC47: needs a close reason only while money is still due', () => {
    expect(closeNeedsReason(1)).toBe(true);
    expect(closeNeedsReason(0)).toBe(false);
  });
});
