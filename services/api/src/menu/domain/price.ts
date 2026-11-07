/**
 * Prices are whole Vietnamese đồng in this range (spec S2 AC5/AC7). The request schema
 * (`dto/menu.dto.ts`) and the database CHECK constraint both read these two constants.
 */
export const MIN_PRICE_VND = 1_000;
export const MAX_PRICE_VND = 100_000_000;
