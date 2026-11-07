import type { Request, Response } from 'express';
import { readCookie } from '../identity/session.cookie.js';

/** One random token per guest phone, bound to one table session (ADR 0002 §3, AC18, AC21). */
export const GUEST_COOKIE = 'tqr_guest';
/** Longer than any meal; the device row dies with its session anyway. */
const GUEST_COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const isLocalPlainHttp = (request: Request): boolean =>
  request.protocol === 'http' && ['localhost', '127.0.0.1'].includes(request.hostname);

export const readGuestCookie = (request: Request): string | undefined =>
  readCookie(request, GUEST_COOKIE);

/** HttpOnly; SameSite=Lax; Secure except on plain-http localhost (same rules as the staff cookie). */
export const setGuestCookie = (request: Request, response: Response, token: string): void => {
  response.cookie(GUEST_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !isLocalPlainHttp(request),
    path: '/',
    maxAge: GUEST_COOKIE_MAX_AGE_MS,
  });
};
