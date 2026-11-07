/**
 * Table choice and "nearest free times" for a booking (AC48, ADR 0007). Pure: the caller loads the
 * tables and the active bookings; times are epoch milliseconds, ranges are half-open `[start, end)`
 * exactly like the `tstzrange(…, '[)')` the exclusion constraint compares.
 */

export interface SeatedTable {
  id: string;
  seats: number;
}

/** An active (pending / confirmed / seated) booking holding a table. */
export interface HeldRange {
  tableId: string;
  start: number;
  end: number;
}

/** How many alternative start times a refused guest is offered. */
export const NEAREST_LIMIT = 3;

export const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number): boolean =>
  aStart < bEnd && bStart < aEnd;

/**
 * Tables that can seat the party, smallest first (the caller's order breaks ties), so a couple
 * does not take the table for eight.
 */
export const candidateTables = <T extends SeatedTable>(tables: readonly T[], party: number): T[] =>
  tables
    .map((table, index) => ({ table, index }))
    .filter(({ table }) => table.seats >= party)
    .sort((a, b) => a.table.seats - b.table.seats || a.index - b.index)
    .map(({ table }) => table);

/** The first candidate with no active booking overlapping `[start, end)`, if any. */
export const freeTable = <T extends SeatedTable>(
  start: number,
  end: number,
  candidates: readonly T[],
  held: readonly HeldRange[],
): T | undefined =>
  candidates.find(
    (table) =>
      !held.some(
        (range) => range.tableId === table.id && overlaps(start, end, range.start, range.end),
      ),
  );

/**
 * AC48: when the requested start has no free table, the closest other starts that do (by distance,
 * the earlier one first on a tie), returned in time order.
 */
export const nearestFreeStarts = (
  requested: number,
  starts: readonly number[],
  slotMs: number,
  candidates: readonly SeatedTable[],
  held: readonly HeldRange[],
  limit = NEAREST_LIMIT,
): number[] =>
  starts
    .filter((start) => start !== requested)
    .filter((start) => freeTable(start, start + slotMs, candidates, held) !== undefined)
    .sort((a, b) => Math.abs(a - requested) - Math.abs(b - requested) || a - b)
    .slice(0, limit)
    .sort((a, b) => a - b);
