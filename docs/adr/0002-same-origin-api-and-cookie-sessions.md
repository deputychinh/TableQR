# ADR 0002: Same-origin API and cookie sessions for staff and guests

- Status: accepted · 2026-11-08

## Context

Staff (owner, cashier, waiter, kitchen) sign in on shared iPads; guests never sign in but must be tied to one table session (spec S5, S6, AC21). There is no hosting yet; the owner wants no paid identity provider. Tokens in `localStorage` can be read by any injected script; cross-origin cookies need `SameSite=None` and CORS with credentials.

## Decision

1. The SPA and the API share one origin: the web app calls `/api/*`; Vite dev and preview servers proxy `/api` to the API, and production serves both behind one reverse proxy.
2. Staff sign in with email + password. Passwords are hashed with `crypto.scrypt` (N = 2^17, r = 8, p = 1, 16-byte salt; OWASP Password Storage Cheat Sheet minimums). A successful sign-in creates a random 256-bit token; only its SHA-256 lives in `auth_sessions`; the cookie `tqr_staff` is `HttpOnly; SameSite=Lax; Secure` (except on `localhost`), 12 h sliding expiry. Sign-in rotates the token; sign-out and account disable delete the rows (AC16).
3. Guests get a random 256-bit `tqr_guest` cookie per device when they check in or join a table session; only its hash is stored, bound to that session; closing the session invalidates it.
4. CSRF: `SameSite=Lax` plus an `Origin` check on every non-GET request and JSON-only bodies.
5. Login throttling (AC4) from the `login_attempts` table, so it survives restarts.

## Consequences

- No CORS in production; the `TQR_WEB_ORIGINS` setting remains only for the `Origin` check.
- Shared iPads: the kitchen account stays signed in; a "switch user" flow is a later backlog item.
- MFA is not offered in release 1 (backlog); ASVS L2 controls for the money path are compensated by role separation (only cashier/owner confirm payments) and an audit trail.
