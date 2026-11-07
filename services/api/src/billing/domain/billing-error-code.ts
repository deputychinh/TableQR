/** Stable billing error codes (clients branch on these, never on messages). */
export enum BillingErrorCode {
  /** AC45: the bill was already confirmed as paid. */
  AlreadyPaid = 'ALREADY_PAID',
  /** AC42: the bill's amount changed and a new code replaced it. */
  BillSuperseded = 'BILL_SUPERSEDED',
  /** AC47: an unpaid session can only be closed with a reason. */
  CloseReasonRequired = 'CLOSE_REASON_REQUIRED',
  SessionClosed = 'SESSION_CLOSED',
  /** No (or an ended) guest cookie: the phone is not joined to an open table session. */
  GuestSessionRequired = 'GUEST_SESSION_REQUIRED',
}
