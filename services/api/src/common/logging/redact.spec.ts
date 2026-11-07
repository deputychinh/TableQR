import { REDACTED, redact } from './redact.js';

describe('redact', () => {
  it('redacts sensitive keys at any depth and in any case', () => {
    const input = {
      method: 'POST',
      headers: { Cookie: 'tqr_staff=abc', Authorization: 'Bearer x' },
      body: { guestName: 'Lan', phone: '0901234567', items: [{ name: 'Phở', token: 't' }] },
      password: 'hunter2',
    };
    expect(redact(input)).toEqual({
      method: 'POST',
      headers: { Cookie: REDACTED, Authorization: REDACTED },
      body: { guestName: REDACTED, phone: REDACTED, items: [{ name: 'Phở', token: REDACTED }] },
      password: REDACTED,
    });
  });

  it('does not mutate its input', () => {
    const input = { password: 'p', nested: { phone: '1' } };
    redact(input);
    expect(input).toEqual({ password: 'p', nested: { phone: '1' } });
  });

  it('keeps primitives, null and safe keys as they are', () => {
    expect(redact('text')).toBe('text');
    expect(redact(null)).toBeNull();
    expect(redact({ status: 200, route: '/api/x' })).toEqual({ status: 200, route: '/api/x' });
  });

  it('survives circular references', () => {
    const a: Record<string, unknown> = { name: 'a' };
    a.self = a;
    expect(redact(a)).toEqual({ name: 'a', self: '[Circular]' });
  });
});
