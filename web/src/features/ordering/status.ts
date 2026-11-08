import type { Component } from 'vue';
import { CircleCheck, CircleX, Clock, Flame, Hourglass, Utensils, Wallet } from 'lucide-vue-next';
import type { Order, OrderItem, OrderStatus } from './api';

/** What the guest sees per dish (AC38): one word, one icon, one tone — from one table. */
export type GuestItemState =
  'confirming' | 'paying' | 'waiting' | 'cooking' | 'done' | 'served' | 'cancelled';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger';

export const ITEM_STATE: Readonly<Record<GuestItemState, { tone: Tone; icon: Component }>> = {
  confirming: { tone: 'warning', icon: Hourglass },
  paying: { tone: 'warning', icon: Wallet },
  waiting: { tone: 'neutral', icon: Clock },
  cooking: { tone: 'neutral', icon: Flame },
  done: { tone: 'success', icon: CircleCheck },
  served: { tone: 'success', icon: Utensils },
  cancelled: { tone: 'danger', icon: CircleX },
};

/** A dish's state from its own status and its order's (pending dishes wait on their order). */
export const guestItemState = (
  orderStatus: OrderStatus,
  item: Pick<OrderItem, 'status'>,
): GuestItemState => {
  if (item.status === 'cancelled' || orderStatus === 'rejected' || orderStatus === 'cancelled') {
    return 'cancelled';
  }
  if (item.status === 'pending')
    return orderStatus === 'awaiting_payment' ? 'paying' : 'confirming';
  return item.status;
};

/** Order-level line under each order's time. */
export const ORDER_STATE: Readonly<Record<OrderStatus, { tone: Tone; icon: Component }>> = {
  held: { tone: 'warning', icon: Hourglass },
  awaiting_payment: { tone: 'warning', icon: Wallet },
  released: { tone: 'success', icon: CircleCheck },
  rejected: { tone: 'danger', icon: CircleX },
  cancelled: { tone: 'danger', icon: CircleX },
};

/** Applies a kitchen `item.status` delta when it is newer than what the page holds (ADR 0004). */
export const applyItemDelta = (
  orders: readonly Order[],
  delta: { itemId: string; status: string; version: number },
): Order[] | undefined => {
  let changed = false;
  const next = orders.map((order) => ({
    ...order,
    items: order.items.map((item) => {
      if (item.id !== delta.itemId || delta.version <= item.version) return item;
      changed = true;
      return { ...item, status: delta.status as OrderItem['status'], version: delta.version };
    }),
  }));
  return changed ? next : undefined;
};

const timeFormat = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' });
/** "19:05" in the device's time zone. */
export const formatTime = (iso: string): string => timeFormat.format(new Date(iso));

/**
 * Main-dish portions the session has ordered that still count for the anomaly limit (AC26): every
 * main item not cancelled, in orders not rejected or cancelled.
 */
export const sessionMainPortions = (orders: readonly Order[]): number =>
  orders
    .filter((order) => order.status !== 'rejected' && order.status !== 'cancelled')
    .flatMap((order) => order.items)
    .filter((item) => item.isMain && item.status !== 'cancelled')
    .reduce((sum, item) => sum + item.quantity, 0);

/** Applies an `order.status` delta to the order it names; undefined when nothing changes. */
export const applyOrderDelta = (
  orders: readonly Order[],
  delta: { orderId: string; status: OrderStatus },
): Order[] | undefined => {
  const target = orders.find((order) => order.id === delta.orderId);
  if (!target || target.status === delta.status) return undefined;
  return orders.map((order) =>
    order.id === delta.orderId ? { ...order, status: delta.status } : order,
  );
};
