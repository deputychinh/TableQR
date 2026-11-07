import { z } from 'zod';

/**
 * House rules (spec S4): how one restaurant runs. Stored as validated JSON in `restaurants.rules`
 * with `restaurants.rules_updated_at` as the version. Pure: no framework, no clock.
 */

export const PAYMENT_TIMINGS = ['pay_after', 'pay_before'] as const;
export const SESSION_OPENINGS = ['self_check_in', 'staff_opens'] as const;
export const ORDER_APPROVALS = ['anomalies_only', 'every_order', 'none'] as const;
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export type Weekday = (typeof WEEKDAYS)[number];

/** Bounds of the numeric rules; the web steppers use the same numbers. */
export const RULE_LIMITS = {
  maxMainPerPerson: { min: 1, max: 10, step: 0.5 },
  minMainPerPerson: { min: 0, max: 5, step: 0.5 },
  slotMinutes: { min: 30, max: 240, step: 15 },
} as const;

const EPSILON = 1e-9;
const onStep = (value: number, min: number, step: number): boolean => {
  const steps = (value - min) / step;
  return Math.abs(steps - Math.round(steps)) < EPSILON;
};

const stepped = (limits: { min: number; max: number; step: number }) =>
  z
    .number()
    .min(limits.min)
    .max(limits.max)
    .refine((value) => onStep(value, limits.min, limits.step), { message: 'not_on_step' });

const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const time = z.string().regex(TIME);

const dayHoursSchema = z
  .object({ closed: z.boolean(), open: time, close: time })
  .strict()
  .refine((day) => day.closed || day.close > day.open, {
    path: ['close'],
    message: 'close_not_after_open',
  });

const openingHoursSchema = z
  .object(
    Object.fromEntries(WEEKDAYS.map((day) => [day, dayHoursSchema])) as Record<
      Weekday,
      typeof dayHoursSchema
    >,
  )
  .strict();

export const houseRulesSchema = z
  .object({
    paymentTiming: z.enum(PAYMENT_TIMINGS),
    sessionOpening: z.enum(SESSION_OPENINGS),
    orderApproval: z.enum(ORDER_APPROVALS),
    anomaly: z
      .object({
        maxMainPerPerson: stepped(RULE_LIMITS.maxMainPerPerson),
        /** 0 turns the "có thể thiếu món" (maybe too little food) flag off. */
        minMainPerPerson: stepped(RULE_LIMITS.minMainPerPerson),
      })
      .strict()
      .refine((anomaly) => anomaly.minMainPerPerson <= anomaly.maxMainPerPerson, {
        path: ['minMainPerPerson'],
        message: 'min_above_max',
      }),
    booking: z
      .object({
        enabled: z.boolean(),
        slotMinutes: stepped(RULE_LIMITS.slotMinutes),
        openingHours: openingHoursSchema,
      })
      .strict(),
  })
  .strict();

export type HouseRules = z.infer<typeof houseRulesSchema>;
export type DayHours = HouseRules['booking']['openingHours'][Weekday];

const DEFAULT_DAY: DayHours = { closed: false, open: '10:00', close: '22:00' };

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object') {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
};

/** Defaults from spec S4; a new restaurant (`rules = {}`) runs on exactly these. */
export const DEFAULT_RULES: HouseRules = deepFreeze({
  paymentTiming: 'pay_after',
  sessionOpening: 'self_check_in',
  orderApproval: 'anomalies_only',
  anomaly: { maxMainPerPerson: 2, minMainPerPerson: 0.5 },
  booking: {
    enabled: true,
    slotMinutes: 90,
    openingHours: Object.fromEntries(WEEKDAYS.map((day) => [day, { ...DEFAULT_DAY }])) as Record<
      Weekday,
      DayHours
    >,
  },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Stored keys over defaults, recursively, so a rule added later gets its default on old rows. */
const mergeOver = (defaults: unknown, stored: unknown): unknown => {
  if (!isRecord(defaults) || !isRecord(stored)) return stored === undefined ? defaults : stored;
  const out: Record<string, unknown> = { ...defaults };
  for (const [key, value] of Object.entries(stored)) out[key] = mergeOver(defaults[key], value);
  return out;
};

/**
 * Reads `restaurants.rules` (possibly `{}` or written before a rule existed) into complete rules.
 * Rows are only written through `houseRulesSchema`, so a failure here is a bug, not user input.
 */
export const readStoredRules = (stored: unknown): HouseRules =>
  houseRulesSchema.parse(mergeOver(DEFAULT_RULES, stored ?? {}));

/** Same rules, compared by value (schema key order is fixed by the parser). */
export const sameRules = (a: HouseRules, b: HouseRules): boolean =>
  JSON.stringify(houseRulesSchema.parse(a)) === JSON.stringify(houseRulesSchema.parse(b));

/**
 * AC12 — a rule change applies to orders placed after it; earlier orders keep theirs.
 *
 * Every order copies a snapshot of the rules in force when it is placed (TQR-012 writes it to
 * `orders.rules_snapshot` in the same transaction as the order). Anything that later judges that
 * order (anomaly check, pay-before-cooking release, bill) reads the order's snapshot, never the
 * restaurant's current rules.
 */
export interface RulesSnapshot {
  /** When these rules took effect (`rules_updated_at`); null = defaults since sign-up. */
  readonly effectiveFrom: string | null;
  readonly rules: HouseRules;
}

/** A deep, frozen copy: changing the restaurant's rules later cannot alter it. */
export const snapshotRules = (rules: HouseRules, effectiveFrom: Date | null): RulesSnapshot =>
  deepFreeze({
    effectiveFrom: effectiveFrom === null ? null : effectiveFrom.toISOString(),
    rules: structuredClone(rules),
  });

/**
 * The rules in force at instant `at`, given the versions a restaurant has had: the latest version
 * whose `effectiveFrom` is at or before `at` (a change at the very same instant already applies).
 * Before any version — defaults.
 */
export const rulesAt = (versions: readonly RulesSnapshot[], at: Date): HouseRules => {
  let best: RulesSnapshot | undefined;
  let bestTime = Number.NEGATIVE_INFINITY;
  for (const version of versions) {
    const from =
      version.effectiveFrom === null
        ? Number.NEGATIVE_INFINITY
        : new Date(version.effectiveFrom).getTime();
    if (from <= at.getTime() && (best === undefined || from >= bestTime)) {
      best = version;
      bestTime = from;
    }
  }
  return best?.rules ?? DEFAULT_RULES;
};
