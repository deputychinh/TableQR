import type { HouseRules } from './house-rules.js';

/**
 * TQR-029: VietQR transfer is a per-restaurant option (house rule `payment.qrEnabled`, default
 * off). Ordering and the kitchen are the product; collecting money by QR is opt-in. Pure.
 */

/** Turning the option on without a bank account is refused: the QR would have nowhere to pay. */
export const qrPaymentNeedsBank = (rules: HouseRules, bank: object | null): boolean =>
  rules.payment.qrEnabled && bank === null;

/**
 * A bill carries a VietQR only when the owner turned the option on and an account is stored. Off
 * wins over a stored account (an account saved before TQR-029, or kept while the option is off).
 */
export const qrPaymentActive = (rules: HouseRules, bankStored: boolean): boolean =>
  rules.payment.qrEnabled && bankStored;
