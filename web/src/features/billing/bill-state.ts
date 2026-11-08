import type { SessionBill } from './api';

/**
 * AC42 on the guest's screen: the code they were looking at is no longer the one to pay — either
 * a new code replaced it or it was superseded with nothing left to pay.
 */
export const billChanged = (previous: SessionBill | undefined, next: SessionBill): boolean => {
  const shown = previous?.bill;
  if (shown?.status !== 'open') return false;
  const now = next.bill;
  if (now === null) return true;
  if (now.id !== shown.id) return now.status !== 'paid';
  return now.status === 'superseded';
};

const pad = (n: number): string => String(n).padStart(2, '0');

/** "14:05 08/11" (local time) for the bank-change banner and times on the cashier screen. */
export const shortDateTime = (iso: string | null): string => {
  if (iso === null) return '';
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
};
