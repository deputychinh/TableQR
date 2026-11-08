import { computed, ref, watch } from 'vue';
import { ApiError } from '@/api/client';
import type { GuestMenu } from '@/features/menu/types';
import type { StreamDelta } from '@/composables/useStream';
import { guestApi, type GuestSession } from '../api';
import {
  addOne,
  applyMenu,
  cartCount,
  cartTotal,
  newIdempotencyKey,
  removeOne,
  setNote,
  toRequestLines,
  type CartChange,
  type CartItemRef,
  type CartLine,
} from '../cart';
import { applyItemDelta } from '../status';

export type Notice =
  | { kind: 'sent' }
  | { kind: 'network' }
  | { kind: 'changed'; changes: CartChange[] }
  | { kind: 'error' };

const storageKey = (sessionId: string) => `tqr:cart:${sessionId}`;

/** Per-phone convenience: the cart survives a reload of the page (never needed for correctness). */
const readStoredCart = (sessionId: string): CartLine[] => {
  try {
    const raw = sessionStorage.getItem(storageKey(sessionId));
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? (value as CartLine[]) : [];
  } catch {
    return [];
  }
};

const storeCart = (sessionId: string, cart: readonly CartLine[]) => {
  try {
    sessionStorage.setItem(storageKey(sessionId), JSON.stringify(cart));
  } catch {
    // private mode or full storage: the cart just lives in memory
  }
};

const isMenuChanged = (error: unknown): boolean =>
  error instanceof ApiError && error.code === 'MENU_CHANGED';

/**
 * The joined guest's state (S7, S11): session with its orders, the menu, the cart and submission.
 * One `Idempotency-Key` per submission, kept across a network failure so the retry cannot
 * duplicate the order (AC24).
 */
export const useGuestOrdering = (initial: GuestSession) => {
  const session = ref<GuestSession>(initial);
  const menu = ref<GuestMenu | null>(null);
  const menuStatus = ref<'loading' | 'ready' | 'error'>('loading');
  const cart = ref<CartLine[]>(readStoredCart(initial.session.id));
  const submitting = ref(false);
  const notice = ref<Notice | null>(null);
  let pendingKey: string | undefined;

  watch(cart, (value) => storeCart(session.value.session.id, value), { deep: true });

  const count = computed(() => cartCount(cart.value));
  const total = computed(() => cartTotal(cart.value));
  const closed = computed(() => session.value.session.status === 'closed');

  const loadMenu = async () => {
    menuStatus.value = 'loading';
    try {
      menu.value = await guestApi.menu();
      menuStatus.value = 'ready';
    } catch {
      menuStatus.value = 'error';
    }
  };

  const refreshSession = async () => {
    try {
      session.value = await guestApi.session();
    } catch {
      // the stream's next snapshot repairs the page
    }
  };

  const changeCart = (next: CartLine[]) => {
    cart.value = next;
    // A different cart is a different submission.
    pendingKey = undefined;
  };

  const add = (item: CartItemRef) => changeCart(addOne(cart.value, item));
  const remove = (menuItemId: string) => changeCart(removeOne(cart.value, menuItemId));
  const note = (menuItemId: string, text: string) =>
    changeCart(setNote(cart.value, menuItemId, text));

  /** AC22–AC25. Resolves true when the order was recorded. */
  const submit = async (): Promise<boolean> => {
    if (cart.value.length === 0 || submitting.value) return false;
    submitting.value = true;
    notice.value = null;
    pendingKey ??= newIdempotencyKey();
    try {
      await guestApi.placeOrder(toRequestLines(cart.value), pendingKey);
      pendingKey = undefined;
      cart.value = [];
      notice.value = { kind: 'sent' };
      await refreshSession();
      return true;
    } catch (error: unknown) {
      if (error instanceof ApiError && error.code === 'NETWORK') {
        notice.value = { kind: 'network' };
      } else if (isMenuChanged(error)) {
        pendingKey = undefined;
        await loadMenu();
        if (menu.value) {
          const result = applyMenu(cart.value, menu.value);
          cart.value = result.cart;
          notice.value = { kind: 'changed', changes: result.changes };
        }
      } else if (error instanceof ApiError && error.code === 'SESSION_CLOSED') {
        pendingKey = undefined;
        await refreshSession();
      } else {
        pendingKey = undefined;
        notice.value = { kind: 'error' };
      }
      return false;
    } finally {
      submitting.value = false;
    }
  };

  /** Stream handlers (ADR 0004): the snapshot is the truth; deltas patch or trigger a refetch. */
  const onSnapshot = (snapshot: GuestSession) => {
    session.value = snapshot;
  };
  const onDelta = (delta: StreamDelta) => {
    if (
      delta.type === 'item.status' &&
      typeof delta.itemId === 'string' &&
      typeof delta.status === 'string' &&
      typeof delta.version === 'number'
    ) {
      const next = applyItemDelta(session.value.orders, {
        itemId: delta.itemId,
        status: delta.status,
        version: delta.version,
      });
      if (next) session.value = { ...session.value, orders: next };
    } else if (delta.type === 'order.status') {
      void refreshSession();
    }
  };

  return {
    session,
    menu,
    menuStatus,
    cart,
    count,
    total,
    closed,
    submitting,
    notice,
    loadMenu,
    add,
    remove,
    note,
    submit,
    onSnapshot,
    onDelta,
  };
};
