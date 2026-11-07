import { ApiError } from '@/api/client';

export type FieldErrors = Record<string, string>;

/** Maps an API error to per-field messages (locale keys) plus a form-level message key. */
export const describeAuthError = (
  error: unknown,
  fieldKeys: Record<string, string>,
): { fields: FieldErrors; form?: string } => {
  if (!(error instanceof ApiError)) return { fields: {}, form: 'errors.unexpected' };
  if (error.code === 'EMAIL_TAKEN') return { fields: { email: 'auth.errors.emailTaken' } };
  if (error.code === 'INVALID_CREDENTIALS')
    return { fields: {}, form: 'auth.errors.invalidCredentials' };
  if (error.code === 'RESTAURANT_SUSPENDED')
    return { fields: {}, form: 'auth.errors.restaurantSuspended' };
  if (error.code === 'LOGIN_BLOCKED') return { fields: {}, form: 'auth.errors.loginBlocked' };
  if (error.code === 'NETWORK') return { fields: {}, form: 'errors.network' };
  if (error.code === 'VALIDATION_FAILED') {
    const fields: FieldErrors = {};
    for (const field of error.fields) {
      const key = fieldKeys[field.path];
      if (key) fields[field.path] = key;
    }
    return Object.keys(fields).length > 0 ? { fields } : { fields, form: 'errors.unexpected' };
  }
  return { fields: {}, form: 'errors.unexpected' };
};
