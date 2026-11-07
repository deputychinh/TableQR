export const MAX_STATION_NAME = 40;
export const MAX_CATEGORY_NAME = 40;
export const MAX_ITEM_NAME = 80;
export const MAX_ITEM_DESCRIPTION = 200;

/** Trims and collapses inner whitespace so "Bếp  nóng " and "Bếp nóng" are the same name. */
export const normalizeName = (value: string): string => value.trim().replace(/\s+/gu, ' ');
