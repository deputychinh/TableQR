/** Same limits as the API (services/api/src/menu/domain/price.ts, spec S2 AC7). */
export const MIN_PRICE_VND = 1_000;
export const MAX_PRICE_VND = 100_000_000;

const vnd = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' });

/** 35000 → "35.000 ₫" (vi-VN grouping, no decimals). */
export const formatVnd = (value: number): string => vnd.format(value);

export type PriceParse = { ok: true; value: number } | { ok: false; problem: PriceProblem };
export type PriceProblem = 'empty' | 'not_whole' | 'too_small' | 'too_big';

/**
 * Reads what the owner typed: "35000", "35.000" and "35 000" all mean 35 000 đồng
 * (in vi-VN the dot groups thousands). A comma is a decimal mark, so it is refused as not whole.
 */
export const parsePrice = (input: string): PriceParse => {
  const compact = input.replace(/[\s.₫đ]/gu, '');
  if (compact === '') return { ok: false, problem: 'empty' };
  if (!/^-?\d+$/u.test(compact)) return { ok: false, problem: 'not_whole' };
  const value = Number(compact);
  if (value < MIN_PRICE_VND) return { ok: false, problem: 'too_small' };
  if (value > MAX_PRICE_VND) return { ok: false, problem: 'too_big' };
  return { ok: true, value };
};

/** 35000 → "35.000" for an input field (no currency sign; the field shows "₫"). */
export const priceInputText = (value: number): string =>
  new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value);
