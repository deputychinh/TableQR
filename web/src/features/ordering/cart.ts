import type { GuestMenu } from '@/features/menu/types';
import type { LineProblem, OrderLineRequest } from './api';

/** Same limits as the API (services/api/src/service/domain/ordering.ts, spec AC22). */
export const CART_LIMITS = { maxLines: 50, maxQuantity: 20, maxNoteLength: 140 } as const;

export interface CartLine {
  menuItemId: string;
  name: string;
  priceVnd: number;
  quantity: number;
  note: string;
}

export type Cart = readonly CartLine[];

export interface CartItemRef {
  id: string;
  name: string;
  priceVnd: number;
}

export const quantityOf = (cart: Cart, menuItemId: string): number =>
  cart.find((line) => line.menuItemId === menuItemId)?.quantity ?? 0;

export const cartCount = (cart: Cart): number => cart.reduce((sum, line) => sum + line.quantity, 0);

export const cartTotal = (cart: Cart): number =>
  cart.reduce((sum, line) => sum + line.priceVnd * line.quantity, 0);

export const canAdd = (cart: Cart, menuItemId: string): boolean => {
  const quantity = quantityOf(cart, menuItemId);
  return quantity > 0 ? quantity < CART_LIMITS.maxQuantity : cart.length < CART_LIMITS.maxLines;
};

/** One more portion; a new line goes to the end. Limits are respected silently (buttons disable). */
export const addOne = (cart: Cart, item: CartItemRef): CartLine[] => {
  if (!canAdd(cart, item.id)) return [...cart];
  if (quantityOf(cart, item.id) === 0) {
    return [
      ...cart,
      { menuItemId: item.id, name: item.name, priceVnd: item.priceVnd, quantity: 1, note: '' },
    ];
  }
  return cart.map((line) =>
    line.menuItemId === item.id ? { ...line, quantity: line.quantity + 1 } : line,
  );
};

/** One portion less; the line disappears at zero. */
export const removeOne = (cart: Cart, menuItemId: string): CartLine[] =>
  cart
    .map((line) =>
      line.menuItemId === menuItemId ? { ...line, quantity: line.quantity - 1 } : line,
    )
    .filter((line) => line.quantity > 0);

export const setNote = (cart: Cart, menuItemId: string, note: string): CartLine[] =>
  cart.map((line) =>
    line.menuItemId === menuItemId
      ? { ...line, note: note.slice(0, CART_LIMITS.maxNoteLength) }
      : line,
  );

export const toRequestLines = (cart: Cart): OrderLineRequest[] =>
  cart.map((line) => ({
    menuItemId: line.menuItemId,
    quantity: line.quantity,
    priceVnd: line.priceVnd,
    note: line.note.trim() === '' ? null : line.note.trim(),
  }));

export interface CartChange {
  name: string;
  kind: 'removed' | 'price';
  priceVnd?: number;
}

/**
 * AC25: after the server refused the cart, bring it in line with the current menu — sold-out or
 * removed dishes leave the cart, changed prices are updated — and say what changed.
 */
export const applyMenu = (
  cart: Cart,
  menu: GuestMenu,
  problems: readonly LineProblem[] = [],
): { cart: CartLine[]; changes: CartChange[] } => {
  const items = new Map(
    menu.categories.flatMap((category) => category.items).map((item) => [item.id, item]),
  );
  const flagged = new Set(problems.map((problem) => problem.menuItemId));
  const next: CartLine[] = [];
  const changes: CartChange[] = [];
  for (const line of cart) {
    const item = items.get(line.menuItemId);
    if (!item || !item.orderable) {
      changes.push({ name: line.name, kind: 'removed' });
    } else if (item.priceVnd !== line.priceVnd || flagged.has(line.menuItemId)) {
      if (item.priceVnd !== line.priceVnd) {
        changes.push({ name: item.name, kind: 'price', priceVnd: item.priceVnd });
      }
      next.push({ ...line, name: item.name, priceVnd: item.priceVnd });
    } else {
      next.push(line);
    }
  }
  return { cart: next, changes };
};

/**
 * A UUID v4 for `Idempotency-Key`. `crypto.randomUUID` exists only in secure contexts, and phones
 * may open the app over plain http on the shop's network, so fall back to `getRandomValues`.
 */
export const newIdempotencyKey = (cryptoImpl: Crypto = globalThis.crypto): string => {
  if (typeof cryptoImpl.randomUUID === 'function') return cryptoImpl.randomUUID();
  const bytes = cryptoImpl.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
