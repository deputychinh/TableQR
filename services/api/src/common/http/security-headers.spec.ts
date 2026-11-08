import type { NextFunction, Request, Response } from 'express';
import { API_SECURITY_HEADERS, HSTS_VALUE, securityHeadersMiddleware } from './security-headers.js';

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
