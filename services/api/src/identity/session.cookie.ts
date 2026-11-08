import type { Request, Response } from 'express';

export const STAFF_COOKIE = 'tqr_staff';

const isLocalPlainHttp = (request: Request): boolean =>
  request.protocol === 'http' && ['localhost', '127.0.0.1'].includes(request.hostname);

/** A value with malformed percent-encoding is treated as absent (→ 401), never a 500. */
const decodeCookieValue = (raw: string): string | undefined => {
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
};

export const readCookie = (request: Request, name: string): string | undefined => {
  const header = request.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeCookieValue(rest.join('='));
  }
  return undefined;
};

/** HttpOnly; SameSite=Lax; Secure except on plain-http localhost (ADR 0002). */
export const setSessionCookie = (
  request: Request,
  response: Response,
  token: string,
  expires: Date,
): void => {
  response.cookie(STAFF_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !isLocalPlainHttp(request),
    path: '/',
    expires,
  });
};

export const clearSessionCookie = (request: Request, response: Response): void => {
  response.clearCookie(STAFF_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !isLocalPlainHttp(request),
    path: '/',
  });
};
