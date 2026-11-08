import { getJson, postJsonWithHeaders, sendJson } from '@/api/client';
import type { GuestMenu } from '@/features/menu/types';

// Shapes of the service-floor API (services/api/src/service); camelCase JSON.

export type OrderStatus = 'held' | 'awaiting_payment' | 'released' | 'rejected' | 'cancelled';
export type ItemStatus = 'pending' | 'waiting' | 'cooking' | 'done' | 'served' | 'cancelled';
export type HoldReason = 'anomaly_over' | 'every_order';

export interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  priceVnd: number;
  quantity: number;
  note: string | null;
  isMain: boolean;
  status: ItemStatus;
  version: number;
}

export interface Order {
  id: string;
  status: OrderStatus;
  holdReason: HoldReason | null;
  requestedAt: string;
  totalVnd: number;
  /** From the order's rules snapshot: the anomaly limit is party size × this (AC26). */
  maxMainPerPerson: number;
  items: OrderItem[];
}

export interface GuestSession {
  restaurant: { name: string; slug: string };
  table: { name: string; seats: number };
  session: { id: string; partySize: number; status: 'open' | 'closed'; openedAt: string };
  orders: Order[];
}

export interface OrderLineRequest {
  menuItemId: string;
  quantity: number;
  priceVnd: number;
  note: string | null;
}

/** AC25: why a cart was refused; the guest sees the current menu afterwards. */
export type LineProblem =
  | { menuItemId: string; reason: 'unknown' | 'unavailable' }
  | { menuItemId: string; reason: 'price_changed'; priceVnd: number };

/** TQR-011: what a scan leads to, asked before check-in (no expected 409 on page load). */
export interface CheckInNext {
  next: 'join' | 'party_size' | 'wait_for_staff';
  maxPartySize: number;
}

export interface ReviewOrder extends Order {
  flag: string | null;
  mainPortions: number;
  /** Main portions of the whole session that still count, this order included. */
  sessionMainPortions: number;
  session: { id: string; partySize: number; openedAt: string };
  table: { id: string; name: string };
}

export const guestApi = {
  checkInNext: (qrToken: string) =>
    getJson<CheckInNext>(`/g/check-in?qr=${encodeURIComponent(qrToken)}`),
  /** Check in (with the party size when opening the table) or join its open session. */
  checkIn: (qrToken: string, partySize?: number) =>
    sendJson<{ opened: boolean }>(
      'POST',
      '/g/session',
      partySize === undefined ? { qrToken } : { qrToken, partySize },
    ),
  session: () => getJson<GuestSession>('/g/session'),
  menu: () => getJson<GuestMenu>('/g/menu'),
  placeOrder: (lines: OrderLineRequest[], idempotencyKey: string) =>
    postJsonWithHeaders<Order>('/g/orders', { lines }, { 'Idempotency-Key': idempotencyKey }),
};

export const GUEST_STREAM_URL = '/api/g/stream';
export const FLOOR_STREAM_URL = '/api/stream/floor';

export const reviewApi = {
  list: async () => (await getJson<{ items: ReviewOrder[] }>('/orders/review')).items,
  confirm: (id: string) => sendJson<Order>('POST', `/orders/${encodeURIComponent(id)}/confirm`),
  reject: (id: string) => sendJson<Order>('POST', `/orders/${encodeURIComponent(id)}/reject`),
  flagSeen: (id: string) => sendJson<void>('POST', `/orders/${encodeURIComponent(id)}/flag-seen`),
};
