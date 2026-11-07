import { ApiError } from '@/api/client';
import { describeAuthError } from './errors';
import { safeNextPath } from './next-path';

describe('describeAuthError', () => {
  const keys = { email: 'auth.errors.email', password: 'auth.errors.password' };

  it.each([
    [new ApiError(409, 'EMAIL_TAKEN'), { fields: { email: 'auth.errors.emailTaken' } }],
    [
      new ApiError(401, 'INVALID_CREDENTIALS'),
      { fields: {}, form: 'auth.errors.invalidCredentials' },
    ],
    [new ApiError(429, 'LOGIN_BLOCKED'), { fields: {}, form: 'auth.errors.loginBlocked' }],
    [
      new ApiError(403, 'RESTAURANT_SUSPENDED'),
      { fields: {}, form: 'auth.errors.restaurantSuspended' },
    ],
    [new ApiError(0, 'NETWORK'), { fields: {}, form: 'errors.network' }],
    [new ApiError(500, 'INTERNAL'), { fields: {}, form: 'errors.unexpected' }],
    [new Error('boom'), { fields: {}, form: 'errors.unexpected' }],
  ])('maps %s', (error, expected) => {
    expect(describeAuthError(error, keys)).toEqual(expected);
  });

  it('maps validation fields to their messages', () => {
    const error = new ApiError(422, 'VALIDATION_FAILED', [
      { path: 'email', code: 'invalid_format' },
      { path: 'password', code: 'too_small' },
    ]);
    expect(describeAuthError(error, keys)).toEqual({
      fields: { email: 'auth.errors.email', password: 'auth.errors.password' },
    });
  });

  it('falls back to a form error when no validation field is known', () => {
    const error = new ApiError(422, 'VALIDATION_FAILED', [
      { path: '(body)', code: 'unrecognized_keys' },
    ]);
    expect(describeAuthError(error, keys)).toEqual({ fields: {}, form: 'errors.unexpected' });
  });
});

describe('safeNextPath', () => {
  it.each([
    ['/quan-ly/ban', '/quan-ly/ban'],
    ['//evil.example', '/quan-ly'],
    ['/\\evil.example', '/quan-ly'],
    ['https://evil.example', '/quan-ly'],
    [undefined, '/quan-ly'],
    [['/a'], '/quan-ly'],
  ])('%s → %s', (next, expected) => {
    expect(safeNextPath(next)).toBe(expected);
  });
});
