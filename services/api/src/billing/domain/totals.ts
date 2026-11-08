/**
 * What a session owes (spec S12). Pure: the service loads the rows, these functions decide.
 */

export type OrderStatus = 'held' | 'awaiting_payment' | 'released' | 'rejected' | 'cancelled';
export type ItemStatus = 'pending' | 'waiting' | 'cooking' | 'done' | 'served' | 'cancelled';

export interface BillableLine {
  orderStatus: OrderStatus;
  itemStatus: ItemStatus;
  priceVnd: number;
  quantity: number;
}

/**
 * Orders the restaurant has accepted: released to the kitchen, or waiting for payment under
 * "pay before cooking" (AC13 — that is exactly what the guest pays for). A `held` order is not
 * billed until staff accept it; rejected and cancelled orders never are.
 */
export const BILLABLE_ORDER_STATUSES: readonly OrderStatus[] = ['released', 'awaiting_payment'];

export const isBillable = (line: BillableLine): boolean =>
  BILLABLE_ORDER_STATUSES.includes(line.orderStatus) && line.itemStatus !== 'cancelled';

/** Sum of price × quantity over billable lines, in whole VND. */
export const sessionTotal = (lines: readonly BillableLine[]): number =>
  lines.filter(isBillable).reduce((sum, line) => sum + line.priceVnd * line.quantity, 0);

/** Still to pay: everything billable minus what paid bills already covered (never negative). */
export const amountDue = (totalVnd: number, paidVnd: number): number =>
  Math.max(0, totalVnd - paidVnd);

export interface BillDecision {
  /** Mark the open bill `superseded` (its amount no longer matches). */
  supersede: boolean;
  /** Issue a new bill with a new code for `dueVnd`. */
  issue: boolean;
}

/**
 * AC42: with an open bill of the same amount the guest keeps the code already on screen; a
 * different amount supersedes it and issues a new code; nothing left to pay → no open bill.
 */
export const decideBill = (dueVnd: number, openBillAmount: number | null): BillDecision => {
  const hasOpen = openBillAmount !== null;
  if (dueVnd <= 0) return { supersede: hasOpen, issue: false };
  if (openBillAmount === dueVnd) return { supersede: false, issue: false };
  return { supersede: hasOpen, issue: true };
};
