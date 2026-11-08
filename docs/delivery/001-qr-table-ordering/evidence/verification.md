# Verification — release 1 (local, web: iPhone + iPad)

Date: 2026-11-08 · Commit: 0088268 · Target: local (`make dev`, http://localhost:5310, API 127.0.0.1:3310, DB `tableqr_dev`)

## How it was run

1. README quick start (`make install`, `make dev`) — the dev servers in use were started that way after `make migrate` created `tableqr_dev`; the page loads on `localhost` and `127.0.0.1`.
2. `make ci` at 0088268 — exit 0: API 345 unit + 623 e2e (Testcontainers Postgres), web 365 unit + 42 Playwright journeys (iPhone 13 + iPad, axe serious/critical = 0, no horizontal scroll on iPhone), script tests, bundle budget 98.1 kB / 150 kB.
3. Fresh end-to-end browser run on the dev server (Playwright, iPhone 390 px for guests and owner, iPad 1180 px for the cashier): `evidence/verify/journey.json`, 20 screenshots in `evidence/verify/` — all opened. 0 failed steps.
4. Benchmarks: `make bench` and `LH_GUEST_MENU=1 make lighthouse` (results below).
5. Independent reviewers walked the whole product in a real browser (owner set-up → guest order → waiter confirm → kitchen with skip reason → serve → guest live status → VietQR bill decoded and CRC checked → cashier → close → booking → seat) — see the review notes in `status.md`.

## Verdict per acceptance criterion

| ACs                                  | Story   | Automated evidence (all green at 0088268)                                                                                                | Browser evidence                                                                                                     | Verdict |
| ------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------- |
| AC1–AC4 sign-up, isolation, throttle | TQR-004 | `auth.e2e-spec.ts` (incl. 30 parallel wrong passwords → ≤ 10 checks), `smoke.spec.ts`                                                    | `verify/01-owner-home-390.png`                                                                                       | pass    |
| AC5–AC7 menu, sold out, price bounds | TQR-006 | `menu.e2e-spec.ts`, `menu.test.ts`, `MenuPage.test.ts`, `menu.spec.ts`                                                                   | `verify/02-price-65000.5-390.png`, `03-menu-390.png`, `15-dish-delete-refused-390.png`, `16-after-ngung-ban-390.png` | pass    |
| AC8–AC11 tables, QR sheet, rotation  | TQR-007 | `tables.e2e-spec.ts`, `qr.test.ts` (QR decodes to the URL), `tables.spec.ts`                                                             | `verify/04-tables-390.png`, `14-table-delete-refused-390.png`                                                        | pass    |
| AC12 house rules                     | TQR-008 | `settings.e2e-spec.ts`, `settings.spec.ts`                                                                                               | `verify/05-settings-390.png`                                                                                         | pass    |
| AC13 pay before cooking              | TQR-019 | `billing.e2e-spec.ts` › pay before cooking … released live                                                                               | `verify/17-paybefore-awaiting-390.png` → `19-paybefore-released-390.png`                                             | pass    |
| AC14–AC16 staff, roles               | TQR-005 | `staff.e2e-spec.ts`, `roles.e2e-spec.ts` (matrix × 5 roles, deny by default), `staff.spec.ts`                                            | reviewer shell screenshots (one shell per role)                                                                      | pass    |
| AC17–AC21 check-in / join            | TQR-011 | `ordering.e2e-spec.ts` (incl. phone of table A scanning B), `ordering.spec.ts`                                                           | `verify/06-guest-menu-390.png`, `09-guestB-entry-390.png`                                                            | pass    |
| AC22–AC25 ordering                   | TQR-012 | `ordering.e2e-spec.ts` (parallel, idempotent, price recomputed), `guest-limits.e2e-spec.ts`                                              | `verify/07-guest-orders-390.png`                                                                                     | pass    |
| AC26–AC29 anomaly hold               | TQR-013 | `service-domain.spec.ts`, `ordering.e2e-spec.ts`, `ReviewPage.test.ts`                                                                   | reviewer run (held → waiter confirms)                                                                                | pass    |
| AC30–AC34 kitchen queue              | TQR-014 | `kitchen.e2e-spec.ts`, `rush-replay.e2e-spec.ts` (0 unfair serves / 302 items), `kitchen.spec.ts`                                        | reviewer run (skip needs a reason)                                                                                   | pass    |
| AC35–AC37 serve                      | TQR-015 | `kitchen.e2e-spec.ts` serve rows, `kitchen.spec.ts` (Đủ món)                                                                             | reviewer run                                                                                                         | pass    |
| AC38–AC39 guest live status          | TQR-016 | `guest-stream.e2e-spec.ts` (freshness p95 5–11 ms, reconnect snapshot)                                                                   | `verify/07-guest-orders-390.png`, `19-paybefore-released-390.png`                                                    | pass    |
| AC40–AC43 bill + VietQR              | TQR-018 | `billing.e2e-spec.ts` (AC42 live incl. after a paid bill), `billing-domain.spec.ts` (2 published vectors, CRC 0x00AF), `billing.spec.ts` | `verify/08-guest-bill-390.png`, `10-guest-bill-changed-390.png`; QR decoded by reviewers (fields + CRC)              | pass    |
| AC44–AC47 cashier                    | TQR-019 | `billing.e2e-spec.ts` (concurrent pay → one 200 + one 409)                                                                               | `verify/11-cashier-1180.png`, `12-guest-paid-390.png`, `13-cashier-after-1180.png`                                   | pass    |
| AC48–AC50 guest booking              | TQR-020 | `booking.e2e-spec.ts` (10 parallel → one 201), `booking.spec.ts`                                                                         | reviewer run                                                                                                         | pass    |
| AC51–AC53 staff booking              | TQR-021 | `booking.e2e-spec.ts`, `booking.spec.ts`                                                                                                 | reviewer run (confirm + seat opens a session)                                                                        | pass    |
| AC54 suspend                         | TQR-009 | `staff.e2e-spec.ts` admin rows, `realtime.e2e-spec.ts` (streams end on suspension), `staff.spec.ts`                                      | — (admin created by CLI)                                                                                             | pass    |
| Isolation sweep                      | TQR-017 | `roles.e2e-spec.ts` › TQR-017 (28 endpoints → 404)                                                                                       | —                                                                                                                    | pass    |

## Quality targets — benchmark diff

| Workload                                          | Target          | Baseline               | This run                                           | Verdict            |
| ------------------------------------------------- | --------------- | ---------------------- | -------------------------------------------------- | ------------------ |
| Guest submits a 5-line cart (`make bench`)        | p95 ≤ 300 ms    | 22.5 ms                | 18.1 ms (361 orders, 0 errors)                     | pass, within noise |
| Status propagation (realtime)                     | p95 ≤ 2 s       | 5–11 ms                | 5–11 ms (`guest-stream.e2e-spec.ts`, in `make ci`) | pass               |
| Fairness (rush replay)                            | 0 unfair serves | 0 / 302 items          | 0 (in `make ci`)                                   | pass               |
| Guest menu cold load (Lighthouse mobile, slow 4G) | LCP ≤ 2.5 s     | 1 959–1 962 ms         | 1 959–1 962 ms (3316e70)                           | pass               |
| Initial JS                                        | ≤ 150 kB gzip   | 98.1 kB                | 98.1 kB                                            | pass               |
| Accessibility                                     | WCAG 2.2 AA     | axe 0 serious/critical | 42 journeys                                        | pass               |
| Tenant isolation                                  | 0 leaks         | —                      | 28/28 → 404                                        | pass               |

## Known issues (filed, not blocking release 1)

- Rate limits and stream caps are in memory per process; behind a proxy set `trust proxy` (docs/security.md, before first deploy).
- Production security headers (TQR-022) and step-up auth for bank changes (TQR-023) are backlog items before the first deploy.
- A success toast can linger over the last list row on phones until it times out.
