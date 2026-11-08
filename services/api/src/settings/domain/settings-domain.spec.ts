import {
  ACCOUNT_NAME_PATTERN,
  ACCOUNT_NUMBER_PATTERN,
  maskAccountNumber,
  normalizeAccountName,
} from './account-name.js';
import { VIETNAM_BANKS, bankByBin, isKnownBin } from './banks.js';
import {
  DEFAULT_RULES,
  type HouseRules,
  RULE_LIMITS,
  WEEKDAYS,
  houseRulesSchema,
  readStoredRules,
  rulesAt,
  sameRules,
  snapshotRules,
} from './house-rules.js';

const rules = (patch: (r: HouseRules) => void = () => undefined): HouseRules => {
  const copy = structuredClone(DEFAULT_RULES);
  patch(copy);
  return copy;
};

const failingPaths = (value: unknown): string[] => {
  const result = houseRulesSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
};

describe('house rules defaults (spec S4)', () => {
  it('are pay after eating, guest self check-in, only anomalies need approval', () => {
    expect(DEFAULT_RULES).toMatchObject({
      paymentTiming: 'pay_after',
      sessionOpening: 'self_check_in',
      orderApproval: 'anomalies_only',
      anomaly: { maxMainPerPerson: 2, minMainPerPerson: 0.5 },
      booking: { enabled: true, slotMinutes: 90 },
    });
  });

  it('open 10:00–22:00 every day of the week', () => {
    expect(Object.keys(DEFAULT_RULES.booking.openingHours)).toEqual([...WEEKDAYS]);
    for (const day of WEEKDAYS) {
      expect(DEFAULT_RULES.booking.openingHours[day]).toEqual({
        closed: false,
        open: '10:00',
        close: '22:00',
      });
    }
  });

  it('pass their own schema and cannot be mutated', () => {
    expect(houseRulesSchema.parse(DEFAULT_RULES)).toEqual(DEFAULT_RULES);
    expect(Object.isFrozen(DEFAULT_RULES.booking.openingHours.mon)).toBe(true);
  });
});

describe('house rules validation', () => {
  it.each([
    ['paymentTiming', 'pay_before'],
    ['sessionOpening', 'staff_opens'],
    ['orderApproval', 'every_order'],
    ['orderApproval', 'none'],
  ] as const)('accepts %s = %s', (key, value) => {
    expect(failingPaths({ ...rules(), [key]: value })).toEqual([]);
  });

  it.each([
    ['paymentTiming', 'pay_later'],
    ['sessionOpening', 'anyone'],
    ['orderApproval', 'sometimes'],
  ] as const)('refuses %s = %s', (key, value) => {
    expect(failingPaths({ ...rules(), [key]: value })).toEqual([key]);
  });

  const max = RULE_LIMITS.maxMainPerPerson;
  const min = RULE_LIMITS.minMainPerPerson;
  const slot = RULE_LIMITS.slotMinutes;

  it.each([
    ['max portions at the lower bound', (r: HouseRules) => (r.anomaly.maxMainPerPerson = max.min)],
    ['max portions at the upper bound', (r: HouseRules) => (r.anomaly.maxMainPerPerson = max.max)],
    ['max portions on a half step', (r: HouseRules) => (r.anomaly.maxMainPerPerson = 2.5)],
    ['min portions 0 (flag off)', (r: HouseRules) => (r.anomaly.minMainPerPerson = 0)],
    ['min portions on a half step', (r: HouseRules) => (r.anomaly.minMainPerPerson = 1.5)],
    [
      'min portions at the upper bound',
      (r: HouseRules) => {
        r.anomaly.minMainPerPerson = min.max;
        r.anomaly.maxMainPerPerson = min.max;
      },
    ],
    ['min equal to max', (r: HouseRules) => (r.anomaly.minMainPerPerson = 2)],
    ['slot at 30 minutes', (r: HouseRules) => (r.booking.slotMinutes = slot.min)],
    ['slot at 240 minutes', (r: HouseRules) => (r.booking.slotMinutes = slot.max)],
    ['slot of 105 minutes (on a 15-minute step)', (r: HouseRules) => (r.booking.slotMinutes = 105)],
    ['booking off', (r: HouseRules) => (r.booking.enabled = false)],
    ['a closed day', (r: HouseRules) => (r.booking.openingHours.mon.closed = true)],
    [
      'a closed day whose saved times are reversed',
      (r: HouseRules) =>
        (r.booking.openingHours.tue = { closed: true, open: '22:00', close: '10:00' }),
    ],
    [
      'a day from 00:00 to 23:59',
      (r: HouseRules) =>
        (r.booking.openingHours.sun = { closed: false, open: '00:00', close: '23:59' }),
    ],
  ])('accepts %s', (_label, patch) => {
    expect(failingPaths(rules(patch))).toEqual([]);
  });

  it.each([
    [
      'max portions one step below the minimum',
      (r: HouseRules) => (r.anomaly.maxMainPerPerson = max.min - max.step),
      'anomaly.maxMainPerPerson',
    ],
    [
      'max portions one step above the maximum',
      (r: HouseRules) => (r.anomaly.maxMainPerPerson = max.max + max.step),
      'anomaly.maxMainPerPerson',
    ],
    [
      'max portions off the half step',
      (r: HouseRules) => (r.anomaly.maxMainPerPerson = 2.25),
      'anomaly.maxMainPerPerson',
    ],
    [
      'min portions one step below 0',
      (r: HouseRules) => (r.anomaly.minMainPerPerson = min.min - min.step),
      'anomaly.minMainPerPerson',
    ],
    [
      'min portions one step above the maximum',
      (r: HouseRules) => {
        r.anomaly.minMainPerPerson = min.max + min.step;
        r.anomaly.maxMainPerPerson = 10;
      },
      'anomaly.minMainPerPerson',
    ],
    [
      'min portions off the half step',
      (r: HouseRules) => (r.anomaly.minMainPerPerson = 0.3),
      'anomaly.minMainPerPerson',
    ],
    [
      'min portions above max portions',
      (r: HouseRules) => {
        r.anomaly.minMainPerPerson = 3;
        r.anomaly.maxMainPerPerson = 2.5;
      },
      'anomaly.minMainPerPerson',
    ],
    [
      'slot one step below 30',
      (r: HouseRules) => (r.booking.slotMinutes = slot.min - slot.step),
      'booking.slotMinutes',
    ],
    [
      'slot one step above 240',
      (r: HouseRules) => (r.booking.slotMinutes = slot.max + slot.step),
      'booking.slotMinutes',
    ],
    [
      'slot off the 15-minute step',
      (r: HouseRules) => (r.booking.slotMinutes = 100),
      'booking.slotMinutes',
    ],
    [
      'closing at the opening time',
      (r: HouseRules) =>
        (r.booking.openingHours.fri = { closed: false, open: '18:00', close: '18:00' }),
      'booking.openingHours.fri.close',
    ],
    [
      'closing before opening',
      (r: HouseRules) =>
        (r.booking.openingHours.sat = { closed: false, open: '18:00', close: '09:00' }),
      'booking.openingHours.sat.close',
    ],
    [
      'a time that is not HH:MM',
      (r: HouseRules) => (r.booking.openingHours.mon.open = '9:00'),
      'booking.openingHours.mon.open',
    ],
    [
      'hour 24',
      (r: HouseRules) => (r.booking.openingHours.mon.close = '24:00'),
      'booking.openingHours.mon.close',
    ],
  ])('refuses %s', (_label, patch, path) => {
    expect(failingPaths(rules(patch))).toContain(path);
  });

  it('refuses unknown keys at every level and a missing weekday', () => {
    expect(failingPaths({ ...rules(), lateMinutes: 15 })).toEqual(['']);
    const noSunday = rules() as unknown as { booking: { openingHours: Record<string, unknown> } };
    delete noSunday.booking.openingHours.sun;
    expect(failingPaths(noSunday)).toEqual(['booking.openingHours.sun']);
    const extraDay = rules() as unknown as { booking: { openingHours: Record<string, unknown> } };
    extraDay.booking.openingHours.holiday = { closed: true, open: '10:00', close: '22:00' };
    expect(failingPaths(extraDay)).toEqual(['booking.openingHours']);
  });

  it('refuses portions sent as strings', () => {
    expect(
      failingPaths(rules((r) => ((r.anomaly as Record<string, unknown>).maxMainPerPerson = '2'))),
    ).toEqual(['anomaly.maxMainPerPerson']);
  });
});

describe('TQR-028 kitchen reminder rules', () => {
  it('default to a reminder after 10 minutes, repeated every 10 minutes', () => {
    expect(DEFAULT_RULES.kitchen).toEqual({ reminderMinutes: 10, repeatMinutes: 10 });
  });

  it.each([5, 10, 15, 20])('accept %i minutes for both', (minutes) => {
    expect(
      failingPaths(
        rules((r) => (r.kitchen = { reminderMinutes: minutes as 5, repeatMinutes: minutes as 5 })),
      ),
    ).toEqual([]);
  });

  it.each([0, 4, 7, 25, '10'])('refuse %s minutes', (minutes) => {
    const bad = rules() as unknown as { kitchen: Record<string, unknown> };
    bad.kitchen.reminderMinutes = minutes;
    bad.kitchen.repeatMinutes = minutes;
    expect(failingPaths(bad)).toEqual(['kitchen.reminderMinutes', 'kitchen.repeatMinutes']);
  });

  it('fill the defaults on a row saved before the rule existed, keep a stored choice', () => {
    expect(readStoredRules({ paymentTiming: 'pay_before' }).kitchen).toEqual({
      reminderMinutes: 10,
      repeatMinutes: 10,
    });
    expect(readStoredRules({ kitchen: { reminderMinutes: 5 } }).kitchen).toEqual({
      reminderMinutes: 5,
      repeatMinutes: 10,
    });
  });
});

describe('readStoredRules', () => {
  it('gives the defaults for a new restaurant (rules = {}) or null', () => {
    expect(readStoredRules({})).toEqual(DEFAULT_RULES);
    expect(readStoredRules(null)).toEqual(DEFAULT_RULES);
  });

  it('keeps stored values and fills rules added after they were saved', () => {
    const stored = { paymentTiming: 'pay_before', booking: { slotMinutes: 120 } };
    const read = readStoredRules(stored);
    expect(read.paymentTiming).toBe('pay_before');
    expect(read.booking.slotMinutes).toBe(120);
    expect(read.booking.enabled).toBe(true);
    expect(read.booking.openingHours.mon).toEqual(DEFAULT_RULES.booking.openingHours.mon);
  });

  it('throws on a corrupt row instead of guessing', () => {
    expect(() => readStoredRules({ paymentTiming: 'whenever' })).toThrow();
  });
});

describe('sameRules', () => {
  it('compares by value', () => {
    expect(sameRules(rules(), structuredClone(DEFAULT_RULES))).toBe(true);
    expect(
      sameRules(
        rules(),
        rules((r) => (r.booking.openingHours.sun.closed = true)),
      ),
    ).toBe(false);
  });
});

describe('AC12 rules snapshot: a change applies to later orders only', () => {
  const t0 = new Date('2026-11-08T03:00:00.000Z');
  const change = new Date('2026-11-08T05:00:00.000Z');
  const payBefore = rules((r) => (r.paymentTiming = 'pay_before'));

  it('a snapshot is a frozen deep copy that later edits cannot reach', () => {
    const live = rules();
    const snapshot = snapshotRules(live, t0);
    live.paymentTiming = 'pay_before';
    live.booking.openingHours.mon.closed = true;
    expect(snapshot.rules.paymentTiming).toBe('pay_after');
    expect(snapshot.rules.booking.openingHours.mon.closed).toBe(false);
    expect(Object.isFrozen(snapshot.rules.booking.openingHours.mon)).toBe(true);
    expect(snapshot.effectiveFrom).toBe(t0.toISOString());
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it('a restaurant that never saved rules snapshots the defaults with no version time', () => {
    expect(snapshotRules(DEFAULT_RULES, null)).toEqual({
      effectiveFrom: null,
      rules: DEFAULT_RULES,
    });
  });

  it('an order placed before the change keeps the old rules, one placed after gets the new', () => {
    const versions = [snapshotRules(DEFAULT_RULES, null), snapshotRules(payBefore, change)];
    expect(rulesAt(versions, new Date(change.getTime() - 1)).paymentTiming).toBe('pay_after');
    expect(rulesAt(versions, change).paymentTiming).toBe('pay_before');
    expect(rulesAt(versions, new Date(change.getTime() + 60_000)).paymentTiming).toBe('pay_before');
  });

  it('picks the latest version in force whatever the list order', () => {
    const later = new Date(change.getTime() + 3_600_000);
    const everyOrder = rules((r) => (r.orderApproval = 'every_order'));
    const versions = [snapshotRules(everyOrder, later), snapshotRules(payBefore, change)];
    expect(rulesAt(versions, t0)).toEqual(DEFAULT_RULES);
    expect(rulesAt(versions, change).paymentTiming).toBe('pay_before');
    expect(rulesAt(versions, later).orderApproval).toBe('every_order');
    expect(rulesAt([], later)).toEqual(DEFAULT_RULES);
  });
});

describe('bank list (NAPAS BIN)', () => {
  it('holds the 20 most common banks with unique 6-digit BINs', () => {
    expect(VIETNAM_BANKS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(VIETNAM_BANKS.map((b) => b.bin)).size).toBe(VIETNAM_BANKS.length);
    for (const bank of VIETNAM_BANKS) expect(bank.bin).toMatch(/^9704\d{2}$/);
  });

  it.each([
    ['970436', 'Vietcombank'],
    ['970415', 'VietinBank'],
    ['970418', 'BIDV'],
    ['970405', 'Agribank'],
    ['970407', 'Techcombank'],
    ['970422', 'MB'],
    ['970416', 'ACB'],
    ['970432', 'VPBank'],
    ['970423', 'TPBank'],
    ['970403', 'Sacombank'],
    ['970437', 'HDBank'],
    ['970441', 'VIB'],
    ['970443', 'SHB'],
    ['970431', 'Eximbank'],
    ['970426', 'MSB'],
    ['970448', 'OCB'],
    ['970440', 'SeABank'],
    ['970449', 'LPBank'],
    ['970428', 'Nam A Bank'],
    ['970409', 'Bac A Bank'],
  ])('BIN %s is %s', (bin, shortName) => {
    expect(bankByBin(bin)?.shortName).toBe(shortName);
    expect(isKnownBin(bin)).toBe(true);
  });

  it('does not know a BIN outside the list', () => {
    expect(isKnownBin('970499')).toBe(false);
    expect(bankByBin('123456')).toBeUndefined();
  });
});

describe('account holder name and number', () => {
  it.each([
    ['Nguyễn Văn Ánh', 'NGUYEN VAN ANH'],
    ['  trần   thị  đào ', 'TRAN THI DAO'],
    ['ĐẶNG HỮU PHƯỚC', 'DANG HUU PHUOC'],
    ['Lê\tQuý  Đôn', 'LE QUY DON'],
    ['Công ty TNHH Phở 24', 'CONG TY TNHH PHO 24'],
  ])('"%s" becomes "%s" and is accepted', (input, expected) => {
    const name = normalizeAccountName(input);
    expect(name).toBe(expected);
    expect(name).toMatch(ACCOUNT_NAME_PATTERN);
  });

  it.each(['NGUYEN-VAN', 'ANH@', '李小龍', ''])('"%s" is refused after normalisation', (input) => {
    expect(normalizeAccountName(input)).not.toMatch(ACCOUNT_NAME_PATTERN);
  });

  it.each(['123456', '1234567890123456789'])('account number %s (6 or 19 digits) is valid', (n) => {
    expect(n).toMatch(ACCOUNT_NUMBER_PATTERN);
  });

  it.each(['12345', '12345678901234567890', '0123 456 789', '01234a678', '-123456'])(
    'account number "%s" is refused',
    (n) => {
      expect(n).not.toMatch(ACCOUNT_NUMBER_PATTERN);
    },
  );

  it('masks all but the last 3 digits for logs', () => {
    expect(maskAccountNumber('0123456789')).toBe('***789');
  });
});
