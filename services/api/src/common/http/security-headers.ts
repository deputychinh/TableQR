import type { NextFunction, Request, Response } from 'express';

/**
 * Headers on every API response (TQR-022, docs/security.md). The API only answers JSON, problem
 * details and event streams, so its CSP lets nothing load and nothing frame it; the SPA's own CSP
 * comes from whatever serves `web/dist` (`deploy/nginx.conf.example`, `vite preview`).
 */
export const API_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

/** Two years, sub-domains included; sent only when `TQR_HSTS=true` (HTTPS in front). */
export const HSTS_VALUE = 'max-age=63072000; includeSubDomains';

export const securityHeadersMiddleware = (options: { hsts: boolean }) => {
  const headers = Object.entries(API_SECURITY_HEADERS);
  if (options.hsts) headers.push(['Strict-Transport-Security', HSTS_VALUE]);
  return (_request: Request, response: Response, next: NextFunction): void => {
    for (const [name, value] of headers) response.setHeader(name, value);
    next();
  };
};
