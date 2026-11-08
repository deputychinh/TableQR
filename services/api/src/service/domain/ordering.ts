import type { HouseRules } from '../../settings/domain/house-rules.js';
import type { HoldReason } from './anomaly.js';

/** Cart limits (spec AC22); the web cart uses the same numbers. */
export const CART_LIMITS = {
  minLines: 1,
  maxLines: 50,
  minQuantity: 1,
  maxQuantity: 20,
  maxNoteLength: 140,
} as const;

/** Party size bounds (AC17, ruling "table seats + 4"). */
export const MIN_PARTY_SIZE = 1;
export const EXTRA_CHAIRS = 4;
export const maxPartySize = (seats: number): number => seats + EXTRA_CHAIRS;
export const isValidPartySize = (partySize: number, seats: number): boolean =>
  Number.isInteger(partySize) && partySize >= MIN_PARTY_SIZE && partySize <= maxPartySize(seats);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string): boolean => UUID.test(value);

/** AC24: the client sends one UUID per submission in `Idempotency-Key`; anything else is refused. */
export const parseIdempotencyKey = (header: string | string[] | undefined): string | undefined => {
  if (typeof header !== 'string') return undefined;
  const key = header.trim().toLowerCase();
  return isUuid(key) ? key : undefined;
};

export interface CartLine {
  menuItemId: string;
  quantity: number;
  /** The price the guest saw; must equal the menu's (AC25). */
  priceVnd: number;
  note: string | null;
}

export interface MenuEntry {
  id: string;
  name: string;
  priceVnd: number;
  available: boolean;
  stationId: string;
  isMain: boolean;
}

export type LineProblem =
  | { menuItemId: string; reason: 'unknown' }
  | { menuItemId: string; reason: 'unavailable' }
  | { menuItemId: string; reason: 'price_changed'; priceVnd: number };

export interface PricedLine extends CartLine {
  name: string;
  stationId: string;
  isMain: boolean;
}

export type PriceResult =
  | { ok: true; lines: PricedLine[]; totalVnd: number; mainPortions: number }
  | { ok: false; problems: LineProblem[] };

/**
 * AC22/AC25: prices every line from the menu (never from the client). Any unknown or "hết món"
 * item, or a price that differs from the menu, rejects the whole cart with every problem listed.
 */
export const priceCart = (
  lines: readonly CartLine[],
  menu: ReadonlyMap<string, MenuEntry>,
): PriceResult => {
  const problems: LineProblem[] = [];
  const priced: PricedLine[] = [];
  for (const line of lines) {
    const entry = menu.get(line.menuItemId);
    if (!entry) problems.push({ menuItemId: line.menuItemId, reason: 'unknown' });
    else if (!entry.available)
      problems.push({ menuItemId: line.menuItemId, reason: 'unavailable' });
    else if (entry.priceVnd !== line.priceVnd) {
      problems.push({
        menuItemId: line.menuItemId,
        reason: 'price_changed',
        priceVnd: entry.priceVnd,
      });
    } else {
      priced.push({ ...line, name: entry.name, stationId: entry.stationId, isMain: entry.isMain });
    }
  }
  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    lines: priced,
    totalVnd: priced.reduce((sum, line) => sum + line.priceVnd * line.quantity, 0),
    mainPortions: priced.reduce((sum, line) => sum + (line.isMain ? line.quantity : 0), 0),
  };
};

export type OrderStatus = 'held' | 'awaiting_payment' | 'released' | 'rejected' | 'cancelled';

/**
 * Status of a new order: held for the waiter (AC26/AC29), else out of the kitchen until payment
 * when the rule is "pay before cooking" (AC13, TQR-019 releases it), else straight to the kitchen.
 */
export const initialOrderStatus = (
  hold: HoldReason | undefined,
  rules: Pick<HouseRules, 'paymentTiming'>,
): OrderStatus => {
  if (hold) return 'held';
  return afterApproval(rules);
};

/** Where a held order goes once a waiter confirms it, or the anomaly no longer applies (AC20, AC28). */
export const afterApproval = (rules: Pick<HouseRules, 'paymentTiming'>): OrderStatus =>
  rules.paymentTiming === 'pay_before' ? 'awaiting_payment' : 'released';
