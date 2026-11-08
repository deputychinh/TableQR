import { DEFAULT_RULES, type HouseRules } from '../../settings/domain/house-rules.js';
import {
  checkOrder,
  isOverLimit,
  minimumMainPortions,
  ordersToRelease,
  type AnomalyInput,
} from './anomaly.js';
import {
  CART_LIMITS,
  afterApproval,
  initialOrderStatus,
  isValidPartySize,
  maxPartySize,
  parseIdempotencyKey,
  priceCart,
  type MenuEntry,
} from './ordering.js';
import {
  ServiceErrorCode,
  guestNotCheckedIn,
  idempotencyKeyRequired,
  menuChanged,
  orderNotHeld,
  partySizeRequired,
  sessionAlreadyOpen,
  sessionClosed,
  waitForStaff,
} from './service-errors.js';

const rules = (
  patch: Partial<Pick<HouseRules, 'orderApproval'>> & { max?: number; min?: number } = {},
) => ({
  orderApproval: patch.orderApproval ?? DEFAULT_RULES.orderApproval,
  anomaly: {
    maxMainPerPerson: patch.max ?? DEFAULT_RULES.anomaly.maxMainPerPerson,
    minMainPerPerson: patch.min ?? DEFAULT_RULES.anomaly.minMainPerPerson,
  },
});

const input = (patch: Partial<AnomalyInput> = {}): AnomalyInput => ({
  partySize: 2,
  mainPortionsBefore: 0,
  mainPortionsInOrder: 2,
  isFirstOrder: true,
  rules: rules(),
  ...patch,
});

describe('checkOrder (AC26–AC29)', () => {
  it('accepts exactly party size × max main portions', () => {
    expect(checkOrder(input({ partySize: 1, mainPortionsInOrder: 2 }))).toEqual({ decision: 'ok' });
  });

  it('holds one portion above party size × max with reason anomaly_over (AC26)', () => {
    expect(checkOrder(input({ partySize: 1, mainPortionsInOrder: 3 }))).toEqual({
      decision: 'hold',
      reason: 'anomaly_over',
    });
  });

  it('counts portions already ordered in the session', () => {
    expect(
      checkOrder(
        input({ partySize: 2, mainPortionsBefore: 4, mainPortionsInOrder: 1, isFirstOrder: false }),
      ),
    ).toEqual({ decision: 'hold', reason: 'anomaly_over' });
    expect(
      checkOrder(
        input({ partySize: 2, mainPortionsBefore: 3, mainPortionsInOrder: 1, isFirstOrder: false }),
      ),
    ).toEqual({ decision: 'ok' });
  });

  it('handles fractional max per person (3 people × 1.5 = 4.5)', () => {
    expect(
      checkOrder(input({ partySize: 3, mainPortionsInOrder: 4, rules: rules({ max: 1.5 }) }))
        .decision,
    ).toBe('ok');
    expect(
      checkOrder(input({ partySize: 3, mainPortionsInOrder: 5, rules: rules({ max: 1.5 }) }))
        .decision,
    ).toBe('hold');
  });

  it('flags below the minimum at the first order without holding (AC27)', () => {
    // 4 people × 0.5 = 2 → 1 main portion is short
    expect(checkOrder(input({ partySize: 4, mainPortionsInOrder: 1 }))).toEqual({
      decision: 'flag-short',
    });
    expect(checkOrder(input({ partySize: 4, mainPortionsInOrder: 2 }))).toEqual({ decision: 'ok' });
  });

  it('rounds the minimum down (3 × 0.5 = 1.5 → 1)', () => {
    expect(minimumMainPortions(3, 0.5)).toBe(1);
    expect(checkOrder(input({ partySize: 3, mainPortionsInOrder: 1 })).decision).toBe('ok');
    expect(checkOrder(input({ partySize: 3, mainPortionsInOrder: 0 })).decision).toBe('flag-short');
  });

  it('flags only the first order', () => {
    expect(
      checkOrder(input({ partySize: 4, mainPortionsInOrder: 0, isFirstOrder: false })).decision,
    ).toBe('ok');
  });

  it('never flags when the minimum is 0', () => {
    expect(
      checkOrder(input({ partySize: 10, mainPortionsInOrder: 0, rules: rules({ min: 0 }) }))
        .decision,
    ).toBe('ok');
  });

  it('holds every order when the rule is every_order (AC29)', () => {
    expect(checkOrder(input({ rules: rules({ orderApproval: 'every_order' }) }))).toEqual({
      decision: 'hold',
      reason: 'every_order',
    });
  });

  it('TQR-013: an order without main dishes never gets the anomaly reason, even in a session already over', () => {
    const over = {
      partySize: 1,
      mainPortionsBefore: 5,
      mainPortionsInOrder: 0,
      isFirstOrder: false,
    };
    expect(checkOrder(input({ ...over, rules: rules({ orderApproval: 'every_order' }) }))).toEqual({
      decision: 'hold',
      reason: 'every_order',
    });
    expect(checkOrder(input(over))).toEqual({ decision: 'ok' });
  });

  it('prefers the anomaly reason when an every_order order is also over the limit', () => {
    expect(
      checkOrder(
        input({
          partySize: 1,
          mainPortionsInOrder: 5,
          rules: rules({ orderApproval: 'every_order' }),
        }),
      ),
    ).toEqual({ decision: 'hold', reason: 'anomaly_over' });
  });

  it('never holds when approval is none, but still flags a short first order', () => {
    expect(
      checkOrder(
        input({ partySize: 1, mainPortionsInOrder: 9, rules: rules({ orderApproval: 'none' }) }),
      ).decision,
    ).toBe('ok');
    expect(
      checkOrder(
        input({ partySize: 4, mainPortionsInOrder: 0, rules: rules({ orderApproval: 'none' }) }),
      ).decision,
    ).toBe('flag-short');
  });

  it('isOverLimit is strict', () => {
    expect(isOverLimit(2, 4, 2)).toBe(false);
    expect(isOverLimit(2, 5, 2)).toBe(true);
  });
});

describe('ordersToRelease (AC20)', () => {
  const held = (
    id: string,
    mainPortions: number,
    holdReason: 'anomaly_over' | 'every_order' = 'anomaly_over',
  ) => ({
    id,
    holdReason,
    mainPortions,
    maxMainPerPerson: 2,
  });

  it('releases a held order once the bigger party covers it', () => {
    expect(ordersToRelease(2, 0, [held('a', 3)])).toEqual(['a']);
    expect(ordersToRelease(1, 0, [held('a', 3)])).toEqual([]);
  });

  it('keeps every_order holds', () => {
    expect(ordersToRelease(10, 0, [held('a', 1, 'every_order')])).toEqual([]);
  });

  it('counts earlier held orders for later ones, in request order', () => {
    expect(ordersToRelease(2, 1, [held('a', 3), held('b', 1)])).toEqual(['a']);
    expect(ordersToRelease(3, 0, [held('a', 3), held('b', 3)])).toEqual(['a', 'b']);
  });
});

describe('party size (AC17)', () => {
  it('accepts 1 … seats + 4 whole people', () => {
    expect(maxPartySize(4)).toBe(8);
    expect(isValidPartySize(1, 4)).toBe(true);
    expect(isValidPartySize(8, 4)).toBe(true);
    expect(isValidPartySize(0, 4)).toBe(false);
    expect(isValidPartySize(9, 4)).toBe(false);
    expect(isValidPartySize(2.5, 4)).toBe(false);
  });
});

describe('idempotency key (AC24)', () => {
  it('accepts a UUID, lower-cased and trimmed', () => {
    expect(parseIdempotencyKey(' 9F3C2A4E-1B2C-4D5E-8F90-0123456789AB ')).toBe(
      '9f3c2a4e-1b2c-4d5e-8f90-0123456789ab',
    );
  });

  it('refuses a missing, repeated or malformed header', () => {
    expect(parseIdempotencyKey(undefined)).toBeUndefined();
    expect(parseIdempotencyKey(['a', 'b'])).toBeUndefined();
    expect(parseIdempotencyKey('retry-1')).toBeUndefined();
    expect(parseIdempotencyKey('')).toBeUndefined();
  });
});

describe('priceCart (AC22, AC25)', () => {
  const menu = new Map<string, MenuEntry>([
    [
      'pho',
      { id: 'pho', name: 'Phở', priceVnd: 45000, available: true, stationId: 's1', isMain: true },
    ],
    [
      'tra',
      {
        id: 'tra',
        name: 'Trà đá',
        priceVnd: 5000,
        available: true,
        stationId: 's2',
        isMain: false,
      },
    ],
    [
      'com',
      { id: 'com', name: 'Cơm', priceVnd: 40000, available: false, stationId: 's1', isMain: true },
    ],
  ]);
  const line = (menuItemId: string, quantity: number, priceVnd: number) => ({
    menuItemId,
    quantity,
    priceVnd,
    note: null,
  });

  it('totals from the menu prices and counts main portions', () => {
    const result = priceCart([line('pho', 2, 45000), line('tra', 3, 5000)], menu);
    expect(result).toMatchObject({ ok: true, totalVnd: 105000, mainPortions: 2 });
    if (result.ok)
      expect(result.lines[0]).toMatchObject({ name: 'Phở', stationId: 's1', isMain: true });
  });

  it('lists every problem: unknown, unavailable and changed price', () => {
    expect(
      priceCart([line('x', 1, 1000), line('com', 1, 40000), line('pho', 1, 40000)], menu),
    ).toEqual({
      ok: false,
      problems: [
        { menuItemId: 'x', reason: 'unknown' },
        { menuItemId: 'com', reason: 'unavailable' },
        { menuItemId: 'pho', reason: 'price_changed', priceVnd: 45000 },
      ],
    });
  });

  it('exposes the cart limits of AC22', () => {
    expect(CART_LIMITS).toEqual({
      minLines: 1,
      maxLines: 50,
      minQuantity: 1,
      maxQuantity: 20,
      maxNoteLength: 140,
    });
  });
});

describe('order status', () => {
  it('holds, waits for payment or goes to the kitchen', () => {
    expect(initialOrderStatus('anomaly_over', { paymentTiming: 'pay_after' })).toBe('held');
    expect(initialOrderStatus(undefined, { paymentTiming: 'pay_before' })).toBe('awaiting_payment');
    expect(initialOrderStatus(undefined, { paymentTiming: 'pay_after' })).toBe('released');
    expect(afterApproval({ paymentTiming: 'pay_before' })).toBe('awaiting_payment');
  });
});

describe('service errors', () => {
  it('carry stable codes and statuses', () => {
    expect(guestNotCheckedIn()).toMatchObject({
      code: ServiceErrorCode.GuestNotCheckedIn,
      status: 401,
    });
    expect(partySizeRequired(8)).toMatchObject({ status: 409, extensions: { maxPartySize: 8 } });
    expect(waitForStaff()).toMatchObject({
      code: 'WAIT_FOR_STAFF',
      detail: 'Vui lòng chờ nhân viên mở bàn',
    });
    expect(sessionClosed().status).toBe(409);
    expect(sessionAlreadyOpen().code).toBe('SESSION_ALREADY_OPEN');
    expect(idempotencyKeyRequired().status).toBe(400);
    expect(menuChanged([]).code).toBe('MENU_CHANGED');
    expect(orderNotHeld().code).toBe('ORDER_NOT_HELD');
  });
});
