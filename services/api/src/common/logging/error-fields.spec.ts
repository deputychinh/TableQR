import { errorFields } from './error-fields.js';

describe('errorFields', () => {
  it('keeps the error name, driver code and constraint but never the message', () => {
    const pgError = Object.assign(new Error('duplicate key value violates "users_email_key"'), {
      code: '23505',
      constraint: 'users_email_key',
    });
    const queryError = new Error(
      'Failed query: insert into bookings values ($1,$2)\nparams: Lan,0901234567',
      { cause: pgError },
    );
    queryError.name = 'DrizzleQueryError';
    const fields = errorFields(queryError);
    expect(fields).toEqual({
      error: 'DrizzleQueryError',
      dbCode: '23505',
      constraint: 'users_email_key',
      causeError: 'Error',
    });
    expect(JSON.stringify(fields)).not.toMatch(/0901234567|Failed query/);
  });

  it('describes non-Error throws by their type', () => {
    expect(errorFields('boom')).toEqual({ error: 'string' });
    expect(errorFields(undefined)).toEqual({ error: 'undefined' });
  });
});
