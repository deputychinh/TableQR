import type { HouseRules } from '../../settings/domain/house-rules.js';

/**
 * Anomaly check (spec S8, AC26–AC29). Pure: the caller counts main-dish portions from the database
 * and passes the rules snapshot the order is judged by (AC12).
 */

export type HoldReason = 'anomaly_over' | 'every_order';

export type AnomalyResult =
  | { decision: 'ok' }
  /** AC27: below party size × min at the first order — told to the waiter, not held. */
  | { decision: 'flag-short' }
  | { decision: 'hold'; reason: HoldReason };

export interface AnomalyInput {
  partySize: number;
  /** Main-dish portions already ordered in the session (held, waiting or released; not cancelled). */
  mainPortionsBefore: number;
  /** Main-dish portions in this order. */
  mainPortionsInOrder: number;
  /** True when the session has no earlier order that still counts (AC27 is about the first one). */
  isFirstOrder: boolean;
  rules: Pick<HouseRules, 'orderApproval' | 'anomaly'>;
}

/** AC26: more than party size × max main portions per person (exactly the limit is fine). */
export const isOverLimit = (
  partySize: number,
  mainPortionsTotal: number,
  maxMainPerPerson: number,
): boolean => mainPortionsTotal > partySize * maxMainPerPerson;

/** AC27 threshold: party size × min per person, rounded down (spec S4). */
export const minimumMainPortions = (partySize: number, minMainPerPerson: number): number =>
  Math.floor(partySize * minMainPerPerson + 1e-9);

export const checkOrder = (input: AnomalyInput): AnomalyResult => {
  const { partySize, mainPortionsBefore, mainPortionsInOrder, isFirstOrder, rules } = input;
  const total = mainPortionsBefore + mainPortionsInOrder;
  // Only an order that adds main dishes can take the session over the limit (TQR-013): a drinks
  // order in a session already over is judged by the approval rule alone.
  const over =
    mainPortionsInOrder > 0 && isOverLimit(partySize, total, rules.anomaly.maxMainPerPerson);
  if (rules.orderApproval !== 'none' && over) return { decision: 'hold', reason: 'anomaly_over' };
  if (rules.orderApproval === 'every_order') return { decision: 'hold', reason: 'every_order' };
  if (isFirstOrder && total < minimumMainPortions(partySize, rules.anomaly.minMainPerPerson)) {
    return { decision: 'flag-short' };
  }
  return { decision: 'ok' };
};

export interface HeldOrder {
  id: string;
  holdReason: HoldReason;
  mainPortions: number;
  maxMainPerPerson: number;
}

/**
 * AC20: after staff changes the party size, decide which anomaly-held orders now pass. Orders are
 * taken in request order; an order that stays held still counts for the ones after it, because the
 * waiter may yet confirm it. Orders held because the rule is "every order" stay held.
 */
export const ordersToRelease = (
  partySize: number,
  mainPortionsCounted: number,
  held: readonly HeldOrder[],
): string[] => {
  const release: string[] = [];
  let before = mainPortionsCounted;
  for (const order of held) {
    const passes =
      order.holdReason === 'anomaly_over' &&
      !isOverLimit(partySize, before + order.mainPortions, order.maxMainPerPerson);
    if (passes) release.push(order.id);
    before += order.mainPortions;
  }
  return release;
};
