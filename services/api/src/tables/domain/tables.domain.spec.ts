import { QR_TOKEN_LENGTH, guestTablePath, isWellFormedQrToken, newQrToken } from './qr-token.js';
import {
  SEATS_MAX,
  SEATS_MIN,
  TABLE_NAME_MAX,
  isValidSeats,
  isValidTableName,
  normalizeTableName,
  tableNameLength,
} from './table-rules.js';

describe('QR token', () => {
  it('is 128 bits of randomness encoded as 22 base64url characters', () => {
    let requested = 0;
    const token = newQrToken((size) => {
      requested = size;
      return Buffer.alloc(size, 0xff);
    });
    expect(requested).toBe(16);
    expect(token).toHaveLength(QR_TOKEN_LENGTH);
    expect(token).toBe('_____________________w');
  });

  it('differs on every call and is always well formed (10 000 draws)', () => {
    const tokens = new Set(Array.from({ length: 10_000 }, () => newQrToken()));
    expect(tokens.size).toBe(10_000);
    for (const token of tokens) expect(isWellFormedQrToken(token)).toBe(true);
  });

  it.each([
    ['too short', 'abc'],
    ['too long', 'a'.repeat(23)],
    ['padding', `${'a'.repeat(21)}=`],
    ['base64 alphabet (+/)', `${'a'.repeat(20)}+/`],
    ['path traversal', '../../../../etc/passwd'],
    ['empty', ''],
  ])('rejects a malformed token: %s', (_label, value) => {
    expect(isWellFormedQrToken(value)).toBe(false);
  });

  it('builds the guest path the QR code opens', () => {
    expect(guestTablePath('AbC_-12345678901234567')).toBe('/t/AbC_-12345678901234567');
  });
});

describe('table name and seats', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeTableName('  Bàn   số\t1  ')).toBe('Bàn số 1');
  });

  it('normalises decomposed Vietnamese to NFC so the same name compares equal', () => {
    const decomposed = 'Bàn 1';
    expect(normalizeTableName(decomposed)).toBe('Bàn 1');
    expect(tableNameLength(normalizeTableName(decomposed))).toBe(5);
  });

  it.each([
    ['empty after trim', '   ', false],
    ['1 character (lower bound)', 'A', true],
    ['30 characters (upper bound)', 'B'.repeat(TABLE_NAME_MAX), true],
    ['31 characters', 'B'.repeat(TABLE_NAME_MAX + 1), false],
    ['30 accented characters', 'à'.repeat(TABLE_NAME_MAX), true],
  ])('name %s → valid = %s', (_label, raw, valid) => {
    expect(isValidTableName(normalizeTableName(raw))).toBe(valid);
  });

  it.each([
    [SEATS_MIN - 1, false],
    [SEATS_MIN, true],
    [4, true],
    [SEATS_MAX, true],
    [SEATS_MAX + 1, false],
    [2.5, false],
    [Number.NaN, false],
  ])('seats %s → valid = %s', (seats, valid) => {
    expect(isValidSeats(seats)).toBe(valid);
  });
});
