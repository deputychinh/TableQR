import { DomainError } from '../common/errors/domain.error.js';

/** Codes owned by the identity context; clients branch on these (RFC 9457 `code`). */
export enum IdentityErrorCode {
  EmailTaken = 'EMAIL_TAKEN',
  InvalidCredentials = 'INVALID_CREDENTIALS',
  LoginBlocked = 'LOGIN_BLOCKED',
  RestaurantSuspended = 'RESTAURANT_SUSPENDED',
  /** Step-up (TQR-023): the change needs the current password and none was sent. */
  ReauthRequired = 'REAUTH_REQUIRED',
  /** Step-up (TQR-023): the current password sent with the change is wrong. */
  ReauthFailed = 'REAUTH_FAILED',
}

/** TQR-023: a sensitive change (the bank account) sent without the current password. */
export const reauthRequiredError = (): DomainError =>
  new DomainError(IdentityErrorCode.ReauthRequired, 422, {
    detail: 'Nhập mật khẩu hiện tại để xác nhận thay đổi này',
    extensions: { fields: [{ path: 'currentPassword', code: 'required' }] },
  });

/** AC2 / AC14: one email per person across the whole system. */
export const EMAIL_UNIQUE_INDEX = 'users_email_key';

export const emailTakenError = (): DomainError =>
  new DomainError(IdentityErrorCode.EmailTaken, 409, {
    detail: 'Email đã được dùng',
    extensions: { fields: [{ path: 'email', code: 'taken' }] },
  });

/** AC54: staff sign-in and guest pages of a suspended restaurant. */
export const restaurantSuspendedError = (): DomainError =>
  new DomainError(IdentityErrorCode.RestaurantSuspended, 403, { detail: 'Nhà hàng tạm ngưng' });
