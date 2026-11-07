export type MoveDirection = 'up' | 'down';

export interface Sortable {
  id: string;
  sortOrder: number;
}

const bySortOrder = (a: Sortable, b: Sortable): number =>
  a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);

/**
 * The two rows whose sort orders swap when `id` moves one step, or null when it is already at
 * that end (or unknown). Ties in sortOrder are broken by id so the answer is stable.
 */
export const swapForMove = <T extends Sortable>(
  rows: readonly T[],
  id: string,
  direction: MoveDirection,
): { moved: T; other: T } | null => {
  const sorted = [...rows].sort(bySortOrder);
  const index = sorted.findIndex((row) => row.id === id);
  if (index === -1) return null;
  const moved = sorted[index];
  const other = sorted[direction === 'up' ? index - 1 : index + 1];
  if (!moved || !other) return null;
  return { moved, other };
};

/** Sort order for a row appended at the end. */
export const nextSortOrder = (rows: readonly Sortable[]): number =>
  rows.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;

export const sortBySortOrder = <T extends Sortable>(rows: readonly T[]): T[] =>
  [...rows].sort(bySortOrder);
