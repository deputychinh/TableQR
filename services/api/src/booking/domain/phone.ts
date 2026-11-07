/**
 * Vietnamese mobile numbers (TQR-020): 10 national digits starting 03/05/07/08/09, stored in
 * E.164 (`+84` and the 9 digits after the leading 0). Pure: no framework.
 */

const SEPARATORS = /[\s.()-]/gu;
const NATIONAL = /^0[35789]\d{8}$/u;

/** `0912 345 678`, `+84 912 345 678` or `84912345678` → `+84912345678`; anything else → null. */
export const normalizeVnMobile = (input: string): string | null => {
  const compact = input.replace(SEPARATORS, '');
  let national: string;
  if (compact.startsWith('+84')) national = `0${compact.slice(3)}`;
  else if (compact.startsWith('84') && compact.length === 11) national = `0${compact.slice(2)}`;
  else national = compact;
  return NATIONAL.test(national) ? `+84${national.slice(1)}` : null;
};
