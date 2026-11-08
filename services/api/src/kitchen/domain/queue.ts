/**
 * Kitchen queue order (spec AC30, ADR 0005). The ONE implementation of "who is next": the SQL
 * `ORDER BY` in `kitchen.service.ts` uses the same three columns (`QUEUE_ORDER_COLUMNS`) and a test
 * asserts both agree on random data.
 *
 * Times are whole microseconds since the epoch, the precision Postgres stores, so two items that
 * differ by less than a millisecond still compare the way the database orders them.
 */
export interface QueueKey {
  /** Release time: submit time, held-order request time, or payment time (ADR 0005 §1). */
  queueAtUs: number;
  /** Table session arrival time: earlier tables win a tie. */
  sessionOpenedAtUs: number;
  /** Creation order of the line: the last tie-breaker, never equal for two items. */
  seq: number;
}

/** The columns the station-queue SQL orders by, in this order, all ascending. */
export const QUEUE_ORDER_COLUMNS = ['queue_at', 'session_opened_at', 'seq'] as const;

/** Negative when `a` is ahead of `b` in the station queue. */
export const compareQueueItems = (a: QueueKey, b: QueueKey): number =>
  a.queueAtUs - b.queueAtUs || a.sessionOpenedAtUs - b.sessionOpenedAtUs || a.seq - b.seq;

/** Statuses an item has while it is in a station queue. */
export const QUEUE_STATUSES = ['waiting', 'cooking'] as const;

export interface QueueCandidate extends QueueKey {
  id: string;
  stationId: string;
  menuItemId: string;
  status: string;
}

const inQueue = (status: string): boolean => (QUEUE_STATUSES as readonly string[]).includes(status);

/**
 * AC32 fairness: the waiting/cooking items of the same dish at the same station that are ahead of
 * `target`, oldest first. Marking `target` done while any exist is a skip and needs a reason.
 */
export const findSkippedOlder = <T extends QueueCandidate>(
  target: QueueCandidate,
  candidates: readonly T[],
): T[] =>
  candidates
    .filter(
      (c) =>
        c.id !== target.id &&
        c.stationId === target.stationId &&
        c.menuItemId === target.menuItemId &&
        inQueue(c.status) &&
        compareQueueItems(c, target) < 0,
    )
    .sort(compareQueueItems);
