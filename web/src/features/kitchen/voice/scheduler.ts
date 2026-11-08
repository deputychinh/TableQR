import type { Ticket } from '../services/kitchen.service';

/**
 * Overdue reminders (TQR-028). Pure: which waiting or cooking dishes are due to be said again at
 * server time `nowMs`. Time always comes from the server-corrected clock of the queue, so an iPad
 * whose clock is off still reminds on time.
 */
export interface ReminderRule {
  /** A dish is overdue once it has waited this long since it entered the queue. */
  minutes: number;
  /** An overdue dish is said again this often until it leaves the queue. */
  repeatMinutes: number;
}

export const DEFAULT_REMINDER: ReminderRule = { minutes: 10, repeatMinutes: 10 };

const MINUTE = 60_000;

type Timed = Pick<Ticket, 'id' | 'queueAt'>;

/** Waited at least the rule's minutes (TQR-028; the ticket shows "Trễ N phút"). */
export const isOverdue = (item: Pick<Ticket, 'queueAt'>, nowMs: number, rule: ReminderRule) =>
  nowMs - Date.parse(item.queueAt) >= rule.minutes * MINUTE;

/**
 * The dishes to say now, in queue order (oldest first): overdue, and never said or said at least
 * `repeatMinutes` ago. `said` maps item id → server time it was last said.
 */
export const dueReminders = <T extends Timed>(
  items: readonly T[],
  nowMs: number,
  rule: ReminderRule,
  said: ReadonlyMap<string, number>,
): T[] =>
  items.filter((item) => {
    if (!isOverdue(item, nowMs, rule)) return false;
    const last = said.get(item.id);
    return last === undefined || nowMs - last >= rule.repeatMinutes * MINUTE;
  });

/**
 * Records that `due` was said at `nowMs` and forgets dishes that left the queue (done, served or
 * cancelled), so they are never said again.
 */
export const markSaid = (
  said: Map<string, number>,
  items: readonly Timed[],
  due: readonly Timed[],
  nowMs: number,
): void => {
  const present = new Set(items.map((i) => i.id));
  for (const id of said.keys()) if (!present.has(id)) said.delete(id);
  for (const item of due) said.set(item.id, nowMs);
};
