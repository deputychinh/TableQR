import { WEEKDAYS, type HouseRules, type Weekday } from '../../settings/domain/house-rules.js';

/**
 * Booking slots (spec S14, AC48–AC49). Restaurants run on Vietnam time (Asia/Ho_Chi_Minh, UTC+7,
 * no daylight saving since 1975), so local ↔ UTC is a fixed offset. Instants are stored in UTC;
 * guests and staff see local dates (`YYYY-MM-DD`) and times (`HH:MM`). Pure: the caller passes `now`.
 */

export type BookingRules = HouseRules['booking'];

export const VN_OFFSET_MINUTES = 7 * 60;
/** Guests choose a start every 30 minutes from opening time. */
export const START_STEP_MINUTES = 30;
/** How far ahead a guest may book. */
export const BOOK_AHEAD_DAYS = 60;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/u;

/** Why a requested start cannot be booked; the web maps each to a sentence (AC49). */
export type SlotRefusal = 'booking_disabled' | 'past' | 'too_far' | 'closed_day' | 'outside_hours';

export type SlotCheck = { ok: true; start: Date; end: Date } | { ok: false; reason: SlotRefusal };

const pad = (n: number): string => String(n).padStart(2, '0');

const dateParts = (date: string): [number, number, number] | null => {
  const match = DATE.exec(date);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d
    ? [y, m, d]
    : null;
};

/** A real calendar date written `YYYY-MM-DD`. */
export const isLocalDate = (date: string): boolean => dateParts(date) !== null;

/** `HH:MM`, 00:00–23:59. */
export const isLocalTime = (time: string): boolean => TIME.test(time);

export const minutesOfDay = (time: string): number =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

const timeOf = (minutes: number): string => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/** Local midnight of `date` as a UTC instant. Throws on a malformed date (validate first). */
const localMidnight = (date: string): number => {
  const parts = dateParts(date);
  if (!parts) throw new RangeError(`not a date: ${date}`);
  const [y, m, d] = parts;
  return Date.UTC(y, m - 1, d) - VN_OFFSET_MINUTES * MINUTE_MS;
};

/** Local date + time in Vietnam → UTC instant. */
export const localToUtc = (date: string, time: string): Date =>
  new Date(localMidnight(date) + minutesOfDay(time) * MINUTE_MS);

/** UTC instant → local date and time in Vietnam. */
export const utcToLocal = (at: Date): { date: string; time: string } => {
  const local = new Date(at.getTime() + VN_OFFSET_MINUTES * MINUTE_MS);
  return {
    date: `${String(local.getUTCFullYear())}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`,
    time: `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`,
  };
};

/** The local calendar day `[from, to)` as UTC instants (staff day list). */
export const localDayBounds = (date: string): { from: Date; to: Date } => {
  const from = localMidnight(date);
  return { from: new Date(from), to: new Date(from + DAY_MS) };
};

export const weekdayOf = (date: string): Weekday => {
  const sundayFirst = new Date(localMidnight(date) + VN_OFFSET_MINUTES * MINUTE_MS).getUTCDay();
  return WEEKDAYS[(sundayFirst + 6) % 7] ?? 'mon';
};

/**
 * Start times a guest can choose on `date`: every 30 minutes from opening, the last one leaving a
 * whole slot before closing. A closed day (or booking turned off) has none.
 */
export const dayStartTimes = (date: string, rules: BookingRules): string[] => {
  const hours = rules.openingHours[weekdayOf(date)];
  if (!rules.enabled || hours.closed) return [];
  const open = minutesOfDay(hours.open);
  const lastStart = minutesOfDay(hours.close) - rules.slotMinutes;
  const times: string[] = [];
  for (let at = open; at <= lastStart; at += START_STEP_MINUTES) times.push(timeOf(at));
  return times;
};

/**
 * AC49: may a guest book `date` at `time`? The slot runs `slotMinutes` from the start and must end
 * by closing time. Checks run from the most general reason to the most specific.
 */
export const checkSlot = (
  date: string,
  time: string,
  rules: BookingRules,
  now: Date,
): SlotCheck => {
  if (!rules.enabled) return { ok: false, reason: 'booking_disabled' };
  const start = localToUtc(date, time);
  const end = new Date(start.getTime() + rules.slotMinutes * MINUTE_MS);
  if (start.getTime() <= now.getTime()) return { ok: false, reason: 'past' };
  if (start.getTime() > now.getTime() + BOOK_AHEAD_DAYS * DAY_MS) {
    return { ok: false, reason: 'too_far' };
  }
  const hours = rules.openingHours[weekdayOf(date)];
  if (hours.closed) return { ok: false, reason: 'closed_day' };
  const from = minutesOfDay(time);
  if (from < minutesOfDay(hours.open) || from + rules.slotMinutes > minutesOfDay(hours.close)) {
    return { ok: false, reason: 'outside_hours' };
  }
  return { ok: true, start, end };
};
