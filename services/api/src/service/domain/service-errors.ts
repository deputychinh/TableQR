import { DomainError } from '../../common/errors/domain.error.js';
import type { LineProblem } from './ordering.js';

/** Stable codes of the service-floor context; clients branch on these (RFC 9457 `code`). */
export const ServiceErrorCode = {
  /** No `tqr_guest` cookie, or one this server does not know. */
  GuestNotCheckedIn: 'GUEST_NOT_CHECKED_IN',
  /** AC17: the table has no open session; the guest must give the party size. */
  PartySizeRequired: 'PARTY_SIZE_REQUIRED',
  /** AC19: the rule is "staff opens" and the table has no open session. */
  WaitForStaff: 'WAIT_FOR_STAFF',
  /** AC21: the phone's session is closed. */
  SessionClosed: 'SESSION_CLOSED',
  SessionAlreadyOpen: 'SESSION_ALREADY_OPEN',
  IdempotencyKeyRequired: 'IDEMPOTENCY_KEY_REQUIRED',
  /** AC25: an item is unavailable, unknown or its price changed. */
  MenuChanged: 'MENU_CHANGED',
  /** Confirm/reject on an order that is no longer held. */
  OrderNotHeld: 'ORDER_NOT_HELD',
} as const;

export const guestNotCheckedIn = (): DomainError =>
  new DomainError(ServiceErrorCode.GuestNotCheckedIn, 401, {
    detail: 'Hãy quét mã QR trên bàn để bắt đầu.',
  });

export const partySizeRequired = (maxPartySize: number): DomainError =>
  new DomainError(ServiceErrorCode.PartySizeRequired, 409, {
    detail: 'Bàn chưa mở. Cho biết số người để bắt đầu.',
    extensions: { maxPartySize },
  });

export const waitForStaff = (): DomainError =>
  new DomainError(ServiceErrorCode.WaitForStaff, 409, {
    detail: 'Vui lòng chờ nhân viên mở bàn',
  });

export const sessionClosed = (): DomainError =>
  new DomainError(ServiceErrorCode.SessionClosed, 409, {
    detail: 'Bàn đã thanh toán và đóng. Quét lại mã QR nếu bạn vẫn đang ngồi.',
  });

export const sessionAlreadyOpen = (): DomainError =>
  new DomainError(ServiceErrorCode.SessionAlreadyOpen, 409, { detail: 'Bàn này đang có khách.' });

export const idempotencyKeyRequired = (): DomainError =>
  new DomainError(ServiceErrorCode.IdempotencyKeyRequired, 400, {
    detail: 'Thiếu Idempotency-Key (UUID) cho lần gửi này.',
  });

export const menuChanged = (problems: readonly LineProblem[]): DomainError =>
  new DomainError(ServiceErrorCode.MenuChanged, 409, {
    detail: 'Thực đơn vừa thay đổi. Hãy xem lại giỏ hàng.',
    extensions: { problems },
  });

export const orderNotHeld = (): DomainError =>
  new DomainError(ServiceErrorCode.OrderNotHeld, 409, {
    detail: 'Đơn này đã được xử lý.',
  });
