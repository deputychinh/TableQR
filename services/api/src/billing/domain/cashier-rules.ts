/** Cashier rules (spec S13, docs/security.md). Pure. */

/** docs/security.md: a bank account change is shown on the cashier screen for 24 h. */
export const BANK_CHANGE_WARNING_MS = 24 * 60 * 60 * 1000;

export const isBankChangeRecent = (changedAt: Date | null, now: Date): boolean =>
  changedAt !== null &&
  now.getTime() - changedAt.getTime() >= 0 &&
  now.getTime() - changedAt.getTime() < BANK_CHANGE_WARNING_MS;

export const CLOSE_REASON_MAX = 200;

/** AC47: closing a session that still owes money needs a reason; a paid one does not. */
export const closeNeedsReason = (dueVnd: number): boolean => dueVnd > 0;

export const PAYMENT_METHODS = ['transfer', 'cash'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Same rule as the staff list: display name, else "Chủ quán" (owner) or the email before "@". */
export const payerName = (
  displayName: string | null,
  email: string | null,
  role: string | null,
): string | null => {
  const name = displayName?.trim();
  if (name) return name;
  if (role === 'owner') return 'Chủ quán';
  return email === null ? null : (email.split('@')[0] ?? email);
};
