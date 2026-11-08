import type { Ticket } from '../services/kitchen.service';

/**
 * New-dish detection (TQR-027). Pure apart from its own memory of ids.
 *
 * The first list the screen gets after it starts listening is what was already there: nothing of
 * it is read. Every later list (a re-read after a released order, or the snapshot after a
 * reconnect) gives only the dishes never seen before, so a reconnect never reads old dishes again
 * and a dish is read at most once. Only waiting dishes are read: one another screen already started
 * needs no call.
 */
export interface ArrivalTracker {
  take: <T extends Pick<Ticket, 'id' | 'status'>>(items: readonly T[]) => T[];
}

export const createArrivalTracker = (): ArrivalTracker => {
  const known = new Set<string>();
  let primed = false;
  return {
    take: (items) => {
      const fresh = items.filter((item) => !known.has(item.id));
      for (const item of items) known.add(item.id);
      if (!primed) {
        primed = true;
        return [];
      }
      return fresh.filter((item) => item.status === 'waiting');
    },
  };
};
