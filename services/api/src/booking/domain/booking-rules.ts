/**
 * Booking life cycle and limits (spec S14–S15, TQR-020/021). Pure: no framework, no clock.
 */

export const BOOKING_STATUSES = ['pending', 'confirmed', 'seated', 'cancelled', 'no_show'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Statuses that hold a table; the exclusion constraint applies only to these (ADR 0007). */
export const ACTIVE_STATUSES = ['pending', 'confirmed', 'seated'] as const;

export const BOOKING_LIMITS = {
  party: { min: 1, max: 30 },
  name: { min: 2, max: 60 },
  noteMax: 140,
  /** Abuse guard: bookings one phone may create at one restaurant in 24 hours. */
  perPhonePerDay: 5,
} as const;

/** AC53: "Trễ" after this many minutes past the start without being seated. */
export const LATE_AFTER_MINUTES = 15;
/** Guest name and phone are erased this many days after the slot ends (docs/security.md). */
export const RETENTION_DAYS = 30;

export const BookingErrorCode = {
  NotAllowed: 'BOOKING_NOT_ALLOWED',
  NoTableFree: 'NO_TABLE_FREE',
  TooManyBookings: 'TOO_MANY_BOOKINGS',
  WrongStatus: 'BOOKING_WRONG_STATUS',
  TableBusy: 'TABLE_BUSY',
  TableTooSmall: 'TABLE_TOO_SMALL',
  TableHasOpenSession: 'TABLE_HAS_OPEN_SESSION',
  TooEarlyForNoShow: 'TOO_EARLY_FOR_NO_SHOW',
} as const;

export type BookingAction = 'confirm' | 'seat' | 'cancel' | 'no_show';

/** Where each staff action may start from; anything else is `BOOKING_WRONG_STATUS`. */
const FROM: Readonly<Record<BookingAction, readonly BookingStatus[]>> = {
  // Confirming a confirmed booking again reassigns its table.
  confirm: ['pending', 'confirmed'],
  seat: ['pending', 'confirmed'],
  cancel: ['pending', 'confirmed'],
  no_show: ['pending', 'confirmed'],
};

const TO: Readonly<Record<BookingAction, BookingStatus>> = {
  confirm: 'confirmed',
  seat: 'seated',
  cancel: 'cancelled',
  no_show: 'no_show',
};

/** The status after `action`, or null when the action is not allowed from `status`. */
export const nextStatus = (status: BookingStatus, action: BookingAction): BookingStatus | null =>
  FROM[action].includes(status) ? TO[action] : null;

const MINUTE_MS = 60_000;

/** AC53: waiting guests (pending or confirmed) 15 minutes past their start are late. */
export const isLate = (status: BookingStatus, start: Date, now: Date): boolean =>
  (status === 'pending' || status === 'confirmed') &&
  now.getTime() >= start.getTime() + LATE_AFTER_MINUTES * MINUTE_MS;

/** When a booking turns "Trễ". */
export const lateAt = (start: Date): Date =>
  new Date(start.getTime() + LATE_AFTER_MINUTES * MINUTE_MS);

/** Bookings whose slot ended before this instant lose their name and phone. */
export const retentionCutoff = (now: Date): Date =>
  new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * MINUTE_MS);

/** Trimmed, inner whitespace collapsed. */
export const normalizeGuestName = (name: string): string => name.trim().replace(/\s+/gu, ' ');

/** Length in code points, the way Postgres `char_length` counts (the CHECK constraints). */
export const charLength = (text: string): number => Array.from(text).length;

export const isValidGuestName = (name: string): boolean =>
  charLength(name) >= BOOKING_LIMITS.name.min && charLength(name) <= BOOKING_LIMITS.name.max;

/** Idempotency-Key header: 8–64 URL-safe characters (the web sends a UUID). */
export const isValidIdempotencyKey = (key: string): boolean => /^[A-Za-z0-9_-]{8,64}$/u.test(key);
