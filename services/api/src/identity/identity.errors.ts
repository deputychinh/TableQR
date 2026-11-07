import { DomainError } from '../common/errors/domain.error.js';

/** Codes owned by the identity context; clients branch on these (RFC 9457 `code`). */
export enum IdentityErrorCode {
  EmailTaken = 'EMAIL_TAKEN',
  InvalidCredentials = 'INVALID_CREDENTIALS',
  LoginBlocked = 'LOGIN_BLOCKED',
  RestaurantSuspended = 'RESTAURANT_SUSPENDED',
}

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
