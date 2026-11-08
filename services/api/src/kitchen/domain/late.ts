/**
 * AC33: an item is late once it has waited longer than its station's threshold, counted from its
 * release time. Exactly at the threshold it is not late yet ("longer than").
 */
const MS_PER_MINUTE = 60_000;

/** The instant after which the item counts as late. */
export const lateAt = (queueAt: Date, lateAfterMinutes: number): Date =>
  new Date(queueAt.getTime() + lateAfterMinutes * MS_PER_MINUTE);

export const isLate = (queueAt: Date, lateAfterMinutes: number, now: Date): boolean =>
  now.getTime() > lateAt(queueAt, lateAfterMinutes).getTime();
