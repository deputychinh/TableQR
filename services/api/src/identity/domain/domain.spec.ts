import { hashToken, newSessionToken } from './session-token.js';
import { slugify } from './slug.js';
import { LOGIN_WINDOW_MS, MAX_FAILED_LOGINS, isLoginBlocked, windowStart } from './throttle.js';

describe('slugify', () => {
  it.each([
    ['Bún Chả Hà Nội', 'bun-cha-ha-noi'],
    ['Quán Đức  #1', 'quan-duc-1'],
    ['!!!', 'nha-hang'],
    ['a'.repeat(60), 'a'.repeat(40)],
  ])('%s → %s', (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });
});

describe('throttle', () => {
  it('blocks from the 10th failure in the window', () => {
    expect(isLoginBlocked(MAX_FAILED_LOGINS - 1)).toBe(false);
    expect(isLoginBlocked(MAX_FAILED_LOGINS)).toBe(true);
  });

  it('starts the window 15 minutes ago', () => {
    const now = new Date('2026-11-08T10:00:00Z');
    expect(now.getTime() - windowStart(now).getTime()).toBe(LOGIN_WINDOW_MS);
  });
});

describe('session token', () => {
  it('is 256-bit random and hashed deterministically', () => {
    const a = newSessionToken();
    expect(Buffer.from(a, 'base64url')).toHaveLength(32);
    expect(a).not.toBe(newSessionToken());
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});
