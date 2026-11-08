import type { GuestMenu } from '@/features/menu/types';
import type { Order } from './api';
import {
  CART_LIMITS,
  addOne,
  applyMenu,
  canAdd,
  cartCount,
  cartTotal,
  newIdempotencyKey,
  quantityOf,
  removeOne,
  setNote,
  toRequestLines,
  type CartLine,
} from './cart';
import { applyItemDelta, guestItemState } from './status';

const pho = { id: 'pho', name: 'Phở bò', priceVnd: 45000 };
const tra = { id: 'tra', name: 'Trà đá', priceVnd: 5000 };
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('cart (AC22)', () => {
  it('adds, counts, totals and removes portions', () => {
    let cart: CartLine[] = addOne([], pho);
    cart = addOne(cart, pho);
    cart = addOne(cart, tra);
    expect(quantityOf(cart, 'pho')).toBe(2);
    expect(cartCount(cart)).toBe(3);
    expect(cartTotal(cart)).toBe(95000);
    cart = removeOne(cart, 'tra');
    expect(cart.map((line) => line.menuItemId)).toEqual(['pho']);
  });

  it('stops at 20 portions of a dish and at 50 different dishes', () => {
    let cart: CartLine[] = [];
    for (let i = 0; i < 25; i += 1) cart = addOne(cart, pho);
    expect(quantityOf(cart, 'pho')).toBe(CART_LIMITS.maxQuantity);
    expect(canAdd(cart, 'pho')).toBe(false);
    const full: CartLine[] = Array.from({ length: 50 }, (_, i) => ({
      menuItemId: `m${String(i)}`,
      name: 'x',
      priceVnd: 1000,
      quantity: 1,
      note: '',
    }));
    expect(canAdd(full, 'new')).toBe(false);
    expect(canAdd(full, 'm1')).toBe(true);
    expect(addOne(full, { id: 'new', name: 'n', priceVnd: 1000 })).toHaveLength(50);
  });

  it('keeps notes to 140 characters and sends blank notes as null', () => {
    let cart = setNote(addOne(addOne([], pho), tra), 'pho', `  ít hành ${'x'.repeat(200)}`);
    expect(cart[0]?.note).toHaveLength(140);
    cart = setNote(cart, 'pho', '  ít hành  ');
    expect(toRequestLines(cart)).toEqual([
      { menuItemId: 'pho', quantity: 1, priceVnd: 45000, note: 'ít hành' },
      { menuItemId: 'tra', quantity: 1, priceVnd: 5000, note: null },
    ]);
  });
});

describe('applyMenu (AC25)', () => {
  const menu = (
    items: { id: string; name: string; priceVnd: number; orderable: boolean }[],
  ): GuestMenu => ({
    restaurant: { name: 'Q', slug: 'q' },
    categories: [
      {
        id: 'c',
        name: 'Món',
        isMain: true,
        items: items.map((i) => ({ ...i, description: null })),
      },
    ],
  });

  it('drops sold-out and removed dishes, updates changed prices and says what changed', () => {
    const cart = addOne(addOne(addOne([], pho), tra), { id: 'gone', name: 'Bún', priceVnd: 30000 });
    const result = applyMenu(
      cart,
      menu([
        { ...pho, priceVnd: 50000, orderable: true },
        { ...tra, orderable: false },
      ]),
    );
    expect(result.cart).toEqual([{ ...cart[0], priceVnd: 50000 }]);
    expect(result.changes).toEqual([
      { name: 'Phở bò', kind: 'price', priceVnd: 50000 },
      { name: 'Trà đá', kind: 'removed' },
      { name: 'Bún', kind: 'removed' },
    ]);
  });

  it('keeps an unchanged cart as it is', () => {
    const cart = addOne([], pho);
    expect(applyMenu(cart, menu([{ ...pho, orderable: true }]))).toEqual({ cart, changes: [] });
  });
});

describe('newIdempotencyKey (AC24)', () => {
  it('uses randomUUID when the context is secure', () => {
    expect(newIdempotencyKey()).toMatch(UUID_V4);
  });

  it('builds a v4 UUID from getRandomValues on plain http', () => {
    const insecure = {
      getRandomValues: (array: Uint8Array) => array.fill(255),
    } as unknown as Crypto;
    const key = newIdempotencyKey(insecure);
    expect(key).toMatch(UUID_V4);
    expect(key).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });
});

describe('guest dish state (AC38)', () => {
  it('maps every status to one of the seven guest words', () => {
    expect(guestItemState('held', { status: 'pending' })).toBe('confirming');
    expect(guestItemState('awaiting_payment', { status: 'pending' })).toBe('paying');
    expect(guestItemState('released', { status: 'waiting' })).toBe('waiting');
    expect(guestItemState('released', { status: 'cooking' })).toBe('cooking');
    expect(guestItemState('released', { status: 'done' })).toBe('done');
    expect(guestItemState('released', { status: 'served' })).toBe('served');
    expect(guestItemState('released', { status: 'cancelled' })).toBe('cancelled');
    expect(guestItemState('rejected', { status: 'pending' })).toBe('cancelled');
  });

  it('applies only newer item versions', () => {
    const orders: Order[] = [
      {
        id: 'o',
        status: 'released',
        holdReason: null,
        requestedAt: '2026-11-08T12:00:00.000Z',
        totalVnd: 45000,
        items: [
          {
            id: 'i',
            menuItemId: 'pho',
            name: 'Phở',
            priceVnd: 45000,
            quantity: 1,
            note: null,
            isMain: true,
            status: 'waiting',
            version: 2,
          },
        ],
      },
    ];
    expect(applyItemDelta(orders, { itemId: 'i', status: 'cooking', version: 2 })).toBeUndefined();
    expect(applyItemDelta(orders, { itemId: 'x', status: 'cooking', version: 9 })).toBeUndefined();
    expect(
      applyItemDelta(orders, { itemId: 'i', status: 'cooking', version: 3 })?.[0]?.items[0],
    ).toMatchObject({
      status: 'cooking',
      version: 3,
    });
  });
});
