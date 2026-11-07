import type { ItemStatus } from './item-status.js';

/** One non-cancelled item of an open table session, as the floor sees it. */
export interface FloorItemRow {
  id: string;
  version: number;
  seq: number;
  sessionId: string;
  tableName: string;
  partySize: number;
  sessionOpenedAt: Date;
  name: string;
  quantity: number;
  note: string | null;
  status: ItemStatus;
  doneAt: Date | null;
}

export interface ReadyItem {
  id: string;
  version: number;
  name: string;
  quantity: number;
  note: string | null;
  doneAt: string;
}

/** A table on the waiter screen: its ready dishes and how far the whole order is (AC35, AC37). */
export interface FloorTable {
  sessionId: string;
  tableName: string;
  partySize: number;
  /** "Xong" dishes waiting to be carried out, oldest first (AC35). */
  ready: ReadyItem[];
  /** Dishes not ready yet (held, waiting or cooking). */
  remaining: number;
  served: number;
  /** "Đủ món": every item is served or cancelled, and at least one was served (AC37). */
  complete: boolean;
}

export interface ReadyBoard {
  tables: FloorTable[];
}

const REMAINING: ReadonlySet<ItemStatus> = new Set(['pending', 'waiting', 'cooking']);

const byDoneThenSeq = (a: FloorItemRow, b: FloorItemRow): number =>
  (a.doneAt?.getTime() ?? 0) - (b.doneAt?.getTime() ?? 0) || a.seq - b.seq;

/** Rank: tables with ready dishes first, then tables still cooking, then complete tables. */
const rank = (table: FloorTable): number => {
  if (table.ready.length > 0) return 0;
  return table.complete ? 2 : 1;
};

/**
 * Groups the floor's items by table session. Tables with ready dishes come first, the one whose
 * dish has been ready longest at the top (AC35); ties fall back to arrival order.
 */
export const buildReadyBoard = (rows: readonly FloorItemRow[]): ReadyBoard => {
  const groups = new Map<string, FloorItemRow[]>();
  for (const row of rows) {
    if (row.status === 'cancelled') continue;
    const group = groups.get(row.sessionId);
    if (group) group.push(row);
    else groups.set(row.sessionId, [row]);
  }
  const tables = [...groups.values()].map((items) => {
    const [first] = items as [FloorItemRow, ...FloorItemRow[]];
    const ready = items.filter((i) => i.status === 'done').sort(byDoneThenSeq);
    const remaining = items.filter((i) => REMAINING.has(i.status)).length;
    const served = items.filter((i) => i.status === 'served').length;
    return {
      table: {
        sessionId: first.sessionId,
        tableName: first.tableName,
        partySize: first.partySize,
        ready: ready.map((i) => ({
          id: i.id,
          version: i.version,
          name: i.name,
          quantity: i.quantity,
          note: i.note,
          doneAt: (i.doneAt ?? new Date(0)).toISOString(),
        })),
        remaining,
        served,
        complete: served > 0 && remaining === 0 && ready.length === 0,
      },
      oldestReady: ready[0]?.doneAt?.getTime() ?? Number.POSITIVE_INFINITY,
      openedAt: first.sessionOpenedAt.getTime(),
    };
  });
  tables.sort(
    (a, b) =>
      rank(a.table) - rank(b.table) ||
      (a.oldestReady === b.oldestReady ? 0 : a.oldestReady < b.oldestReady ? -1 : 1) ||
      a.openedAt - b.openedAt ||
      a.table.sessionId.localeCompare(b.table.sessionId),
  );
  return { tables: tables.map((t) => t.table) };
};
