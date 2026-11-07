/** Bank account details as banks print them on a transfer (VietQR, NAPAS 247). */

export const ACCOUNT_NAME_MAX = 50;
export const ACCOUNT_NUMBER_PATTERN = /^\d{6,19}$/;
/** What remains after normalisation: upper-case ASCII letters, digits and single spaces. */
export const ACCOUNT_NAME_PATTERN = /^[A-Z0-9]+(?: [A-Z0-9]+)*$/;

/**
 * "Nguyễn Văn Ánh" → "NGUYEN VAN ANH": removes Vietnamese accents (đ/Đ → D), upper-cases and
 * collapses whitespace, the way banks show the holder's name. Characters that are not letters,
 * digits or spaces are kept, so validation can refuse them instead of silently dropping them.
 */
export const normalizeAccountName = (input: string): string =>
  input
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/[đĐ]/g, 'D')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

/** The last 3 digits, for audit logs that must never hold the full account number. */
export const maskAccountNumber = (accountNumber: string): string => `***${accountNumber.slice(-3)}`;
