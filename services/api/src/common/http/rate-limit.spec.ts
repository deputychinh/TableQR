import { FixedWindowLimiter } from './rate-limit.js';

describe('FixedWindowLimiter', () => {
  it('allows `limit` hits per window per key, then refuses until the window ends', () => {
    const limiter = new FixedWindowLimiter(2, 60_000);
    expect(limiter.hit('a', 0)).toBe(true);
    expect(limiter.hit('a', 1)).toBe(true);
    expect(limiter.hit('a', 2)).toBe(false);
    expect(limiter.hit('b', 2)).toBe(true);
    expect(limiter.hit('a', 59_999)).toBe(false);
    expect(limiter.hit('a', 60_000)).toBe(true);
  });

  it('keeps memory bounded: expired windows are pruned, then the oldest key goes', () => {
    const limiter = new FixedWindowLimiter(1, 1000, 2);
    limiter.hit('a', 0);
    limiter.hit('b', 0);
    limiter.hit('c', 2000);
    expect(limiter.size).toBe(1);
    limiter.hit('d', 2000);
    limiter.hit('e', 2001);
    expect(limiter.size).toBe(2);
  });
});
