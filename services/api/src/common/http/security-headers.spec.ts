import type { NextFunction, Request, Response } from 'express';
import { securityHeadersMiddleware } from './security-headers.js';

/** TQR-022 H1/H2 as literals, not the constants under test (review round 1). */
const API_SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
const HSTS_VALUE = 'max-age=63072000; includeSubDomains';

const run = (hsts: boolean) => {
  const set = new Map<string, string>();
  const response = { setHeader: (name: string, value: string) => set.set(name, value) };
  const next = vi.fn();
  securityHeadersMiddleware({ hsts })(
    {} as Request,
    response as unknown as Response,
    next as NextFunction,
  );
  return { set, next };
};

describe('securityHeadersMiddleware', () => {
  it('sets the full header set without HSTS by default, then continues', () => {
    const { set, next } = run(false);
    expect(Object.fromEntries(set)).toEqual(API_SECURITY_HEADERS);
    expect(set.has('Strict-Transport-Security')).toBe(false);
    expect(next).toHaveBeenCalledOnce();
  });

  it('adds Strict-Transport-Security when HSTS is on', () => {
    expect(run(true).set.get('Strict-Transport-Security')).toBe(HSTS_VALUE);
  });

  it('denies framing both ways and the camera, microphone and location', () => {
    expect(API_SECURITY_HEADERS['X-Frame-Options']).toBe('DENY');
    expect(API_SECURITY_HEADERS['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(API_SECURITY_HEADERS['Permissions-Policy']).toBe(
      'camera=(), microphone=(), geolocation=()',
    );
  });
});
