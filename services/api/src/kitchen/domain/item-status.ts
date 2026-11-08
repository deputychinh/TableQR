/** Order-item statuses (shared contract: `order_items.status` in service.schema.ts). */
export const ITEM_STATUSES = [
  'pending',
  'waiting',
  'cooking',
  'done',
  'served',
  'cancelled',
] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

/** What a cook or a waiter can do to one item (ADR 0005 §4). */
export type ItemAction = 'start' | 'done' | 'serve' | 'cancel';

const TRANSITIONS: Readonly<Record<ItemAction, { from: readonly ItemStatus[]; to: ItemStatus }>> = {
  start: { from: ['waiting'], to: 'cooking' },
  done: { from: ['cooking'], to: 'done' },
  serve: { from: ['done'], to: 'served' },
  // TQR-025: the kitchen cannot make a dish (ran out, spoiled) — only before it leaves the kitchen.
  cancel: { from: ['waiting', 'cooking'], to: 'cancelled' },
};

/** The status an action leads to, or `undefined` when the item is not in the status it needs. */
export const nextStatus = (current: ItemStatus, action: ItemAction): ItemStatus | undefined => {
  const rule = TRANSITIONS[action];
  return rule.from.includes(current) ? rule.to : undefined;
};
