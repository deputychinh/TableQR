import { DEFAULT_RULES, type HouseRules } from '../../settings/domain/house-rules.js';
import {
  BOOKING_LIMITS,
  isLate,
  isValidGuestName,
  isValidIdempotencyKey,
  lateAt,
  nextStatus,
  normalizeGuestName,
  retentionCutoff,
} from './booking-rules.js';
import { candidateTables, freeTable, nearestFreeStarts, overlaps } from './nearest-free.js';
import { normalizeVnMobile } from './phone.js';
import {
  checkSlot,
  dayStartTimes,
  isLocalDate,
  isLocalTime,
  localDayBounds,
  localToUtc,
  utcToLocal,
  weekdayOf,
  type BookingRules,
} from './slots.js';

const rules = (patch: Partial<BookingRules> = {}): BookingRules => ({
  ...structuredClone(DEFAULT_RULES.booking),
  ...patch,
});

const withDay = (
  day: keyof HouseRules['booking']['openingHours'],
  hours: { closed: boolean; open: string; close: string },
): BookingRules => {
  const r = rules();
  r.openingHours[day] = hours;
  return r;
};

describe('phone normalisation', () => {
  it.each([
    ['0912345678', '+84912345678'],
    ['0312 345 678', '+84312345678'],
    ['055.123.4567', '+84551234567'],
    ['(070) 123-4567', '+84701234567'],
    ['+84 812 345 678', '+84812345678'],
    ['84987654321', '+84987654321'],
  ])('accepts %s as %s', (input, expected) => {
    expect(normalizeVnMobile(input)).toBe(expected);
  });

  it.each([
    ['', 'empty'],
    ['091234567', '9 digits'],
    ['09123456789', '11 digits'],
    ['0212345678', 'a landline prefix 02'],
    ['0412345678', 'prefix 04'],
    ['0612345678', 'prefix 06'],
    ['+1 912 345 678', 'a foreign country code'],
    ['+840912345678', '+84 followed by the national 0'],
    ['09123a5678', 'a letter'],
  ])('refuses %s (%s)', (input) => {
    expect(normalizeVnMobile(input)).toBeNull();
  });
});

describe('local time in Vietnam (UTC+7)', () => {
  it('converts a local date and time to UTC and back', () => {
    const at = localToUtc('2026-11-20', '18:30');
    expect(at.toISOString()).toBe('2026-11-20T11:30:00.000Z');
    expect(utcToLocal(at)).toEqual({ date: '2026-11-20', time: '18:30' });
  });

  it('crosses midnight correctly: 06:00 local is the previous UTC day', () => {
    expect(localToUtc('2026-11-20', '06:00').toISOString()).toBe('2026-11-19T23:00:00.000Z');
    expect(utcToLocal(new Date('2026-11-19T17:00:00Z'))).toEqual({
      date: '2026-11-20',
      time: '00:00',
    });
  });

  it('gives the local day as UTC bounds', () => {
    const { from, to } = localDayBounds('2026-11-20');
    expect(from.toISOString()).toBe('2026-11-19T17:00:00.000Z');
    expect(to.toISOString()).toBe('2026-11-20T17:00:00.000Z');
  });

  it('knows the weekday of a local date', () => {
    expect(weekdayOf('2026-11-16')).toBe('mon');
    expect(weekdayOf('2026-11-22')).toBe('sun');
  });

  it('validates dates and times', () => {
    expect(isLocalDate('2026-02-28')).toBe(true);
    expect(isLocalDate('2026-02-29')).toBe(false);
    expect(isLocalDate('2026-13-01')).toBe(false);
    expect(isLocalDate('20-11-2026')).toBe(false);
    expect(isLocalTime('23:59')).toBe(true);
    expect(isLocalTime('24:00')).toBe(false);
    expect(isLocalTime('9:00')).toBe(false);
    expect(() => localToUtc('nope', '10:00')).toThrow(RangeError);
  });
});

describe('start times of a day', () => {
  it('runs every 30 minutes from opening; the last start leaves a whole slot before closing', () => {
    const times = dayStartTimes('2026-11-16', rules({ slotMinutes: 90 }));
    expect(times[0]).toBe('10:00');
    expect(times[1]).toBe('10:30');
    expect(times.at(-1)).toBe('20:30');
    expect(times).toHaveLength(22);
  });

  it('follows each day’s own hours and slot length', () => {
    const r = withDay('mon', { closed: false, open: '17:00', close: '20:00' });
    r.slotMinutes = 120;
    expect(dayStartTimes('2026-11-16', r)).toEqual(['17:00', '17:30', '18:00']);
  });

  it('is empty on a closed day, when booking is off, or when the slot is longer than the day', () => {
    expect(
      dayStartTimes('2026-11-16', withDay('mon', { closed: true, open: '10:00', close: '22:00' })),
    ).toEqual([]);
    expect(dayStartTimes('2026-11-16', rules({ enabled: false }))).toEqual([]);
    const short = withDay('mon', { closed: false, open: '10:00', close: '11:00' });
    expect(dayStartTimes('2026-11-16', short)).toEqual([]);
  });
});

describe('AC49 checkSlot', () => {
  const now = new Date('2026-11-16T03:00:00Z'); // Monday 10:00 local

  it('accepts a future start inside opening hours and gives the slot in UTC', () => {
    expect(checkSlot('2026-11-16', '19:00', rules(), now)).toEqual({
      ok: true,
      start: new Date('2026-11-16T12:00:00Z'),
      end: new Date('2026-11-16T13:30:00Z'),
    });
  });

  it.each([
    ['booking turned off', '2026-11-17', '19:00', rules({ enabled: false }), 'booking_disabled'],
    ['now', '2026-11-16', '10:00', rules(), 'past'],
    ['an earlier time today', '2026-11-16', '09:30', rules(), 'past'],
    ['yesterday', '2026-11-15', '19:00', rules(), 'past'],
    ['more than 60 days ahead', '2027-01-16', '19:00', rules(), 'too_far'],
    [
      'a closed day',
      '2026-11-17',
      '19:00',
      withDay('tue', { closed: true, open: '10:00', close: '22:00' }),
      'closed_day',
    ],
    ['before opening', '2026-11-17', '09:30', rules(), 'outside_hours'],
    ['a slot ending after closing', '2026-11-17', '21:00', rules(), 'outside_hours'],
  ])('refuses %s', (_case, date, time, r, reason) => {
    expect(checkSlot(date, time, r, now)).toEqual({ ok: false, reason });
  });

  it('accepts the last start whose slot ends exactly at closing', () => {
    expect(checkSlot('2026-11-17', '20:30', rules(), now).ok).toBe(true);
  });
});

describe('table choice and nearest free times', () => {
  const tables = [
    { id: 'big', seats: 8 },
    { id: 'two-a', seats: 2 },
    { id: 'four', seats: 4 },
    { id: 'two-b', seats: 2 },
  ];
  const H = 3_600_000;

  it('orders the tables that fit by seats, keeping the caller’s order on ties', () => {
    expect(candidateTables(tables, 2).map((t) => t.id)).toEqual(['two-a', 'two-b', 'four', 'big']);
    expect(candidateTables(tables, 5).map((t) => t.id)).toEqual(['big']);
    expect(candidateTables(tables, 9)).toEqual([]);
  });

  it('treats ranges as half-open: back-to-back slots do not overlap', () => {
    expect(overlaps(0, 2, 2, 4)).toBe(false);
    expect(overlaps(0, 3, 2, 4)).toBe(true);
    expect(overlaps(2, 4, 0, 3)).toBe(true);
  });

  it('picks the smallest free table', () => {
    const candidates = candidateTables(tables, 2);
    expect(freeTable(0, H, candidates, [])?.id).toBe('two-a');
    expect(freeTable(0, H, candidates, [{ tableId: 'two-a', start: 0, end: H }])?.id).toBe('two-b');
    expect(freeTable(H, 2 * H, candidates, [{ tableId: 'two-a', start: 0, end: H }])?.id).toBe(
      'two-a',
    );
  });

  it('offers the closest other free starts in time order, earlier first on a tie', () => {
    const one = [{ id: 'only', seats: 4 }];
    const starts = [0, 1, 2, 3, 4, 5, 6].map((h) => h * H);
    // The table is held 2h–4h30; a 1h slot starting at 2h, 3h or 4h overlaps it.
    const held = [{ tableId: 'only', start: 2 * H, end: 4.5 * H }];
    expect(nearestFreeStarts(3 * H, starts, H, one, held)).toEqual([0, 1 * H, 5 * H]);
    expect(nearestFreeStarts(3 * H, starts, H, one, held, 2)).toEqual([1 * H, 5 * H]);
  });

  it('offers nothing when no start of the day is free', () => {
    const one = [{ id: 'only', seats: 4 }];
    expect(
      nearestFreeStarts(0, [0, H], H, one, [{ tableId: 'only', start: 0, end: 3 * H }]),
    ).toEqual([]);
    expect(nearestFreeStarts(0, [0, H], H, [], [])).toEqual([]);
  });
});

describe('booking life cycle', () => {
  it('lets staff confirm (or reassign), seat, cancel or mark no-show a waiting booking', () => {
    expect(nextStatus('pending', 'confirm')).toBe('confirmed');
    expect(nextStatus('confirmed', 'confirm')).toBe('confirmed');
    expect(nextStatus('pending', 'seat')).toBe('seated');
    expect(nextStatus('confirmed', 'seat')).toBe('seated');
    expect(nextStatus('confirmed', 'cancel')).toBe('cancelled');
    expect(nextStatus('pending', 'no_show')).toBe('no_show');
  });

  it.each(['seated', 'cancelled', 'no_show'] as const)('refuses every action once %s', (status) => {
    for (const action of ['confirm', 'seat', 'cancel', 'no_show'] as const) {
      expect(nextStatus(status, action)).toBeNull();
    }
  });

  it('AC53 is late 15 minutes after the start while still waiting', () => {
    const start = new Date('2026-11-16T12:00:00Z');
    const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000);
    expect(isLate('pending', start, at(14))).toBe(false);
    expect(isLate('pending', start, at(15))).toBe(true);
    expect(isLate('confirmed', start, at(60))).toBe(true);
    expect(isLate('seated', start, at(60))).toBe(false);
    expect(isLate('cancelled', start, at(60))).toBe(false);
    expect(lateAt(start)).toEqual(at(15));
  });

  it('erases personal data of slots that ended more than 30 days ago', () => {
    expect(retentionCutoff(new Date('2026-12-31T00:00:00Z')).toISOString()).toBe(
      '2026-12-01T00:00:00.000Z',
    );
  });

  it('normalises and bounds guest names by characters, not bytes', () => {
    expect(normalizeGuestName('  Nguyễn   Văn  An ')).toBe('Nguyễn Văn An');
    expect(isValidGuestName('A')).toBe(false);
    expect(isValidGuestName('Ân')).toBe(true);
    expect(isValidGuestName('ễ'.repeat(BOOKING_LIMITS.name.max))).toBe(true);
    expect(isValidGuestName('ễ'.repeat(BOOKING_LIMITS.name.max + 1))).toBe(false);
  });

  it('accepts URL-safe idempotency keys of 8–64 characters', () => {
    expect(isValidIdempotencyKey('0b5a1f0e-3c1d-4c8e-9d7a-2f6f9b1d2c3e')).toBe(true);
    expect(isValidIdempotencyKey('short')).toBe(false);
    expect(isValidIdempotencyKey('x'.repeat(65))).toBe(false);
    expect(isValidIdempotencyKey('has space key')).toBe(false);
  });
});
