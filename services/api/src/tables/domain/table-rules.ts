/** Business limits of a dining table (spec S3, AC8). */
export const TABLE_NAME_MIN = 1;
export const TABLE_NAME_MAX = 30;
export const SEATS_MIN = 1;
export const SEATS_MAX = 30;
/** Safety cap per restaurant; also the list size (design: lists max 200). */
export const TABLES_PER_RESTAURANT_MAX = 200;

/**
 * Canonical table name: Unicode NFC (so "Bàn" typed on iOS and on Windows compares equal),
 * trimmed, inner whitespace collapsed to one space.
 */
export const normalizeTableName = (raw: string): string =>
  raw.normalize('NFC').trim().replace(/\s+/gu, ' ');

/** Length in code points after NFC (what Postgres `char_length` counts), not UTF-16 units. */
export const tableNameLength = (name: string): number => Array.from(name).length;

export const isValidTableName = (name: string): boolean => {
  const length = tableNameLength(name);
  return length >= TABLE_NAME_MIN && length <= TABLE_NAME_MAX;
};

export const isValidSeats = (seats: number): boolean =>
  Number.isInteger(seats) && seats >= SEATS_MIN && seats <= SEATS_MAX;
