import { randomInt } from 'node:crypto';

/**
 * Bill codes (ADR 0006): 5 characters of Crockford base32 — digits and upper-case letters without
 * I, L, O and U, so a cashier reading a transfer memo cannot confuse 1/I/L or 0/O.
 * 32^5 ≈ 33.5 million codes; uniqueness per restaurant is enforced by a unique index.
 */
export const BILL_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const BILL_CODE_LENGTH = 5;
const CODE_PATTERN = new RegExp(`^[${BILL_CODE_ALPHABET}]{${String(BILL_CODE_LENGTH)}}$`);

/** `pick(n)` returns an integer in [0, n); defaults to a CSPRNG so codes are not guessable. */
export const newBillCode = (pick: (n: number) => number = (n) => randomInt(n)): string => {
  let code = '';
  for (let i = 0; i < BILL_CODE_LENGTH; i += 1) {
    code += BILL_CODE_ALPHABET.charAt(pick(BILL_CODE_ALPHABET.length));
  }
  return code;
};

/**
 * What a person typed or a bank printed → canonical code (Crockford decoding: case-insensitive,
 * O → 0, I/L → 1, hyphens and spaces ignored); `undefined` when it cannot be a bill code.
 */
export const normalizeBillCode = (input: string): string | undefined => {
  const code = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return CODE_PATTERN.test(code) ? code : undefined;
};

/** The transfer memo that identifies a bill: `TQR <code>`. */
export const billMemo = (code: string): string => `TQR ${code}`;
