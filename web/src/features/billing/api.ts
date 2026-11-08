import { getJson, sendJson } from '@/api/client';

/** Shapes of the billing API (services/api/src/billing/billing.service.ts). */
export type BillStatus = 'open' | 'superseded' | 'paid';
export type PaymentMethod = 'transfer' | 'cash';

export interface Bill {
  id: string;
  code: string;
  memo: string;
  amountVnd: number;
  status: BillStatus;
  createdAt: string;
  paidAt: string | null;
  method: PaymentMethod | null;
}

export interface BillLine {
  id: string;
  name: string;
  quantity: number;
  priceVnd: number;
  lineTotalVnd: number;
}

export interface SessionBill {
  restaurantName: string;
  session: { id: string; tableName: string; status: 'open' | 'closed' };
  lines: BillLine[];
  totalVnd: number;
  paidVnd: number;
  dueVnd: number;
  bill: Bill | null;
  transfer: {
    payload: string;
    bankName: string;
    accountNumber: string;
    accountName: string;
  } | null;
  payAtCounter: boolean;
}

export interface CashierSession {
  sessionId: string;
  tableName: string;
  partySize: number;
  openedAt: string;
  totalVnd: number;
  paidVnd: number;
  dueVnd: number;
  bill: (Bill & { paidByName: string | null }) | null;
}

export interface CashierOverview {
  sessions: CashierSession[];
  bankConfigured: boolean;
  bankChangedAt: string | null;
  bankChangedRecently: boolean;
}

/** The guest's own bill, as it stands (no new code). */
export const getGuestBill = (): Promise<SessionBill> => getJson<SessionBill>('/g/bill');

/** "Thanh toán": issues the bill for what the table owes now, or keeps the same code (AC42). */
export const requestGuestBill = (): Promise<SessionBill> =>
  sendJson<SessionBill>('POST', '/g/bill');

export const GUEST_BILL_STREAM = '/api/g/bill/stream';
export const FLOOR_STREAM = '/api/stream/floor';

export const getCashierOverview = (): Promise<CashierOverview> =>
  getJson<CashierOverview>('/bills/overview');

export const requestStaffBill = (sessionId: string): Promise<SessionBill> =>
  sendJson<SessionBill>('POST', '/bills', { sessionId });

export const payBill = (billId: string, method: PaymentMethod): Promise<SessionBill> =>
  sendJson<SessionBill>('POST', `/bills/${encodeURIComponent(billId)}/pay`, { method });

export const closeSession = (sessionId: string, reason?: string): Promise<unknown> =>
  sendJson('POST', `/sessions/${encodeURIComponent(sessionId)}/close`, reason ? { reason } : {});
