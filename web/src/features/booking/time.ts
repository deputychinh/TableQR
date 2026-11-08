/**
 * Dates, times and phone numbers as people in Vietnam read them. Restaurants run on
 * Asia/Ho_Chi_Minh time whatever the device's own time zone is; the API stores UTC.
 */

export const RESTAURANT_TIME_ZONE = 'Asia/Ho_Chi_Minh';
/** Same window as the API (BOOK_AHEAD_DAYS). */
export const BOOK_AHEAD_DAYS = 60;

const isoDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: RESTAURANT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const clock = new Intl.DateTimeFormat('vi-VN', {
  timeZone: RESTAURANT_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const longDay = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
});

/** Today (or the day of `at`) in Vietnam as `YYYY-MM-DD`. */
export const restaurantToday = (at: Date = new Date()): string => isoDate.format(at);

/** `YYYY-MM-DD` moved by whole days. */
export const shiftDate = (date: string, days: number): string => {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
};

export const isIsoDate = (date: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/u.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`));

/** `2026-11-20` → `thứ Sáu, 20/11/2026`. */
export const formatDay = (date: string): string => longDay.format(new Date(`${date}T00:00:00Z`));

/** An ISO instant → `19:30` in Vietnam. */
export const formatClock = (iso: string): string => clock.format(new Date(iso));

const SEPARATORS = /[\s.()-]/gu;

/** Same rule as the API: 10 digits starting 03/05/07/08/09, or with +84 / 84 instead of 0. */
export const isVnMobile = (input: string): boolean => {
  const compact = input.replace(SEPARATORS, '');
  let national = compact;
  if (compact.startsWith('+84')) national = `0${compact.slice(3)}`;
  else if (compact.startsWith('84') && compact.length === 11) national = `0${compact.slice(2)}`;
  return /^0[35789]\d{8}$/u.test(national);
};

/** `+84912345678` → `0912 345 678`. */
export const formatPhone = (e164: string): string => {
  const national = e164.startsWith('+84') ? `0${e164.slice(3)}` : e164;
  return `${national.slice(0, 4)} ${national.slice(4, 7)} ${national.slice(7)}`;
};
