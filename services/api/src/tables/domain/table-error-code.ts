/** Stable error codes of the tables context; clients branch on these, never on messages. */
export const TableErrorCode = {
  NameTaken: 'TABLE_NAME_TAKEN',
  LimitReached: 'TABLE_LIMIT_REACHED',
  HasHistory: 'TABLE_HAS_HISTORY',
  /** TQR-024: a table with guests at it (an open session) cannot be hidden. */
  InUse: 'TABLE_IN_USE',
  QrExpired: 'QR_EXPIRED',
  GuestTableNotFound: 'TABLE_NOT_FOUND',
} as const;
