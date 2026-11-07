import { isNewer } from '@/composables/useStream';
import type { QueueStatus, Ticket } from './services/kitchen.service';

/**
 * Local copy of one station queue (ADR 0004). The server's order is the only order: this file
 * never sorts. Items keep their place when their status changes, leave when they are done, and a
 * new item makes the screen re-read the queue from the server.
 */
export interface SeenStatus {
  status: string;
  version: number;
}

const inQueue = (status: string): status is QueueStatus =>
  status === 'waiting' || status === 'cooking';

/**
 * Takes a server list (snapshot or re-read) as the truth, except where a delta already told us
 * something newer: such items get the newer status, or leave if they left the queue.
 */
export const mergeServerList = (
  items: readonly Ticket[],
  seen: ReadonlyMap<string, SeenStatus>,
): Ticket[] =>
  items.flatMap((item) => {
    const latest = seen.get(item.id);
    if (!latest || !isNewer(item.version, latest.version)) return [item];
    return inQueue(latest.status)
      ? [{ ...item, status: latest.status, version: latest.version }]
      : [];
  });

export interface DeltaResult {
  items: Ticket[];
  /** An item we have no ticket for joined the queue: read the queue again. */
  refetch: boolean;
}

/** Applies one `item.status` delta; older or repeated deltas change nothing. */
export const applyItemDelta = (
  items: readonly Ticket[],
  seen: Map<string, SeenStatus>,
  delta: { itemId: string; status: string; version: number },
): DeltaResult => {
  const previous = seen.get(delta.itemId);
  if (previous && !isNewer(previous.version, delta.version)) {
    return { items: [...items], refetch: false };
  }
  seen.set(delta.itemId, { status: delta.status, version: delta.version });
  const current = items.find((i) => i.id === delta.itemId);
  if (!current) return { items: [...items], refetch: inQueue(delta.status) };
  if (!isNewer(current.version, delta.version)) return { items: [...items], refetch: false };
  if (!inQueue(delta.status)) {
    return { items: items.filter((i) => i.id !== delta.itemId), refetch: false };
  }
  return {
    items: items.map((i) =>
      i.id === delta.itemId
        ? { ...i, status: delta.status as QueueStatus, version: delta.version }
        : i,
    ),
    refetch: false,
  };
};

/** Waiting or cooking tickets of the same dish that are ahead of `ticket` (AC32, for the sheet). */
export const olderSameDish = (items: readonly Ticket[], ticket: Ticket): Ticket[] => {
  const index = items.findIndex((i) => i.id === ticket.id);
  return items.slice(0, Math.max(0, index)).filter((i) => i.menuItemId === ticket.menuItemId);
};

/** AC33: late once the clock passes the server-given `lateAt` (the threshold lives on the API). */
export const isLate = (ticket: Pick<Ticket, 'lateAt'>, nowMs: number): boolean =>
  nowMs > Date.parse(ticket.lateAt);

/** Whole minutes since the ticket entered the queue (AC34), never negative. */
export const waitedMinutes = (ticket: Pick<Ticket, 'queueAt'>, nowMs: number): number =>
  Math.max(0, Math.floor((nowMs - Date.parse(ticket.queueAt)) / 60_000));
