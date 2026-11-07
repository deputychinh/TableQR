/** Stable error codes of the tables context; clients branch on these, never on messages. */
export const TableErrorCode = {
  NameTaken: 'TABLE_NAME_TAKEN',
  LimitReached: 'TABLE_LIMIT_REACHED',
  QrExpired: 'QR_EXPIRED',
  GuestTableNotFound: 'TABLE_NOT_FOUND',
} as const;
