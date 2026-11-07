# TableQR — plan

Appetite: 6 days of agent work (0.4 spent) · Estimate: 20 items, 4.5–7 days (60 %) — no history in this repo yet; re-estimate after slice 1 · Updated: 2026-11-08

Tasks below are exact for slice 1; items of later slices list their test-first steps and are refined into a story file by `deliver-loop` when they start (ruling: the code they touch does not exist yet).

## Slices

| Slice                                       | Stories / ACs                             | How the user sees it                                                            | Estimate  | Release |
| ------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------- | --------- | ------- |
| 0 Walking skeleton                          | —                                         | `make dev`, open http://localhost:5310                                          | done      | v0.1.0  |
| 0b Same origin + harness + baseline         | ADR 0002 proxy, RFC 9457, quality targets | `make bench`, `benchmarks/baseline.json`, Lighthouse budget in `make ci`        | 0.3 d     | —       |
| 1 Set up the restaurant                     | S1–S5, S16 (AC1–AC12, AC14–AC16, AC54)    | sign up at `/dang-ky`, build menu, add tables, print QR sheet `/quan-ly/ban/in` | 1.2–1.8 d | v0.2.0  |
| 2 Seat, order, cook, serve (core, riskiest) | S6–S11 (AC17–AC39)                        | scan a table QR on a phone, order; kitchen iPad `/bep`; waiter `/phuc-vu`       | 1.8–2.6 d | v0.3.0  |
| 3 Pay                                       | S12–S13, AC13 (AC40–AC47)                 | bill with VietQR on the phone; cashier `/thu-ngan`                              | 0.6–0.9 d | v0.4.0  |
| 4 Book ahead                                | S14–S15 (AC48–AC53)                       | `/r/<slug>/dat-ban`; staff `/dat-ban`                                           | 0.6–0.9 d | v0.5.0  |

## Backlog items

| Id      | Title                                                                                                               | ACs                                       | Depends on | Risk                      |
| ------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------- | ------------------------- |
| TQR-001 | Walking skeleton                                                                                                    | —                                         | —          | done                      |
| TQR-002 | Same-origin `/api` proxy, RFC 9457 errors, request id logging with PII redaction                                    | ADR 0002 §1, security baseline            | 001        | low                       |
| TQR-003 | Benchmark harness + baseline (k6 order/health, Lighthouse + bundle budget); realtime and rush rows added by TQR-016 | quality targets                           | 002        | low                       |
| TQR-004 | Restaurant sign-up, staff sign-in/out, cookie sessions, throttling, tenant guard                                    | AC1–AC4                                   | 002        | medium (security)         |
| TQR-005 | Staff accounts and role guard                                                                                       | AC14–AC16                                 | 004        | medium                    |
| TQR-006 | Menu: stations, categories (main dish flag), items, availability                                                    | AC5–AC7                                   | 004        | low                       |
| TQR-007 | Tables, QR tokens, printable QR sheet, rotation                                                                     | AC8–AC11                                  | 004        | low                       |
| TQR-008 | House rules and bank account settings                                                                               | AC12 (AC13 enforced in TQR-018)           | 004        | low                       |
| TQR-009 | ~ Platform admin: suspend / reactivate a restaurant                                                                 | AC54                                      | 004        | low                       |
| TQR-010 | Realtime hub: SSE streams + `pg_notify` + resync (spike first: 300 streams, delay p95)                              | infra for AC31, AC38, AC39                | 004        | **high**                  |
| TQR-011 | Guest check-in / join table session, guest cookie                                                                   | AC17–AC21                                 | 007, 008   | medium                    |
| TQR-012 | Guest menu and ordering with idempotency and price check                                                            | AC22–AC25                                 | 006, 011   | medium                    |
| TQR-013 | Anomaly check, held orders, waiter confirm/reject                                                                   | AC26–AC29                                 | 012        | medium                    |
| TQR-014 | Kitchen station queue (FIFO, skip with reason, late highlight)                                                      | AC30–AC34                                 | 010, 012   | **high** (core)           |
| TQR-015 | Waiter ready list and serve                                                                                         | AC35–AC37                                 | 014        | low                       |
| TQR-016 | Guest live dish status + realtime and rush-replay benchmark rows                                                    | AC38–AC39, fairness and freshness targets | 010, 014   | medium                    |
| TQR-017 | Tenant isolation and role e2e matrix (all endpoints so far)                                                         | AC3, AC15 (fitness)                       | 016        | medium                    |
| TQR-018 | Bill with VietQR payload and QR rendering                                                                           | AC40–AC43                                 | 012        | medium (spec correctness) |
| TQR-019 | Cashier confirm payment, close session, pay-before-cooking release                                                  | AC44–AC47, AC13                           | 018        | medium                    |
| TQR-020 | Guest table booking with exclusion constraint                                                                       | AC48–AC50                                 | 007, 008   | medium                    |
| TQR-021 | Staff booking list: confirm, seat, cancel, late flag                                                                | AC51–AC53                                 | 020, 011   | low                       |

Coverage check: AC1–AC4 → 004; AC5–7 → 006; AC8–11 → 007; AC12 → 008; AC13 → 019; AC14–16 → 005; AC17–21 → 011; AC22–25 → 012; AC26–29 → 013; AC30–34 → 014; AC35–37 → 015; AC38–39 → 016; AC40–43 → 018; AC44–47 → 019; AC48–50 → 020; AC51–53 → 021; AC54 → 009. Every AC has an item.

## Tasks (per item)

### TQR-002 Same-origin `/api`, problem details, logging

1. [ ] Failing e2e `services/api/test/errors.e2e-spec.ts::unknown route answers problem+json with code NOT_FOUND` — `cd services/api && npm run test:e2e`
2. [ ] `app.setGlobalPrefix('api')`; `src/common/errors/{error-code.enum.ts,domain.error.ts,problem.filter.ts}` (RFC 9457, `code`, no stack in body) — green
3. [ ] Failing unit `src/common/logging/redact.spec.ts` (cookie, authorization, phone, guestName, password) → `redact.ts`; JSON request log with request id — green
4. [ ] Web: `web/vite.config.ts` proxy `/api` → `http://127.0.0.1:3310` for `server` and `preview`; `web/src/api/client.ts` base `/api`; Playwright smoke routes `**/api/health` — `make ci` green
5. [ ] Commit `feat(api): same-origin api prefix, problem details and redacted logs`

### TQR-003 Benchmark harness + baseline

1. [ ] `bench/api.js` k6 workload for `/api/health` (placeholder for order submit until TQR-012) with p95 threshold
2. [ ] Lighthouse CI config `web/lighthouserc.json` (mobile, LCP ≤ 2.5 s) + bundle budget script `web/scripts/bundle-budget.mjs` (≤ 150 kB gzip JS) in `make ci`
3. [ ] Run `make bench`, record `benchmarks/baseline.json` and the machine line in `benchmarks/plan.md`
4. [ ] Commit `chore(ci): benchmark harness and baseline`

### TQR-004 Sign-up, sign-in, sessions, throttling

1. [ ] Migration `drizzle/0000_identity.sql` via `npm run db:generate` from `src/db/schema.ts` (restaurants, users, auth_sessions, login_attempts)
2. [ ] Failing unit `src/identity/domain/password.spec.ts` (hash/verify, wrong password, constant-time compare) → `password.ts` (scrypt)
3. [ ] Failing e2e `test/auth.e2e-spec.ts`: AC1 sign-up signs in (cookie set, `GET /api/me` 200); AC2 duplicate email 409 `EMAIL_TAKEN`; AC4 11th failure → 429 `LOGIN_BLOCKED`; sign-out → `/api/me` 401
4. [ ] `src/identity/{identity.module.ts,auth.controller.ts,auth.service.ts,sessions.repository.ts,users.repository.ts,staff.guard.ts}`; `TenantId` brand in `src/common/tenant.ts` — green
5. [ ] Web `/dang-ky`, `/dang-nhap` pages (`src/features/auth/*`), locale keys, component tests, e2e journey sign-up → dashboard
6. [ ] Commit `feat(api): restaurant sign-up and staff sessions` and `feat(web): sign-up and sign-in screens`

### TQR-005 … TQR-021

Each starts with: story file in `docs/stories/TQR-<n>.md` from the spec's ACs → failing e2e per AC in `services/api/test/<context>.e2e-spec.ts` and pure-domain unit tests in `src/<context>/domain/*.spec.ts` → implementation → web screen with component tests and one Playwright journey on iPhone + iPad → `make ci` → commit.
Domain units first where design names them: `anomaly.ts` (013), `queue.ts` (014), `vietqr.ts` + `bill-code.ts` (018), `slots.ts` (020), `house-rules.ts` (008), `party.ts` (011).

## Circuit breaker (cut in this order)

1. ~ AC53 late booking flag, AC33 late highlight (keep ordering)
2. ~ TQR-009 platform admin (do it by SQL until then)
3. ~ AC27 "có thể thiếu món" flag (keep the hold rule AC26)
4. ~ Lighthouse CI in `make ci` (keep the bundle budget)
5. ~ TQR-021 staff booking UI beyond confirm/seat
6. Slice 4 entirely (booking) — only with the owner told, since they asked for it

## Risks

| Risk                                                 | Spike / mitigation                                                  | Result                                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| SSE fan-out delay on 1 vCPU with hundreds of streams | spike inside TQR-010: 300 streams, 50 status changes/s, measure p95 | done 2026-11-08: p95 21 ms over 30 000 deliveries (local, not 1 vCPU) — risk retired; re-measure in TQR-016 bench |
| VietQR payload rejected by real banking apps         | decoder test + manual scan with 2 bank apps in demo (TQR-018)       | pending                                                                                                           |
| iOS Safari drops EventSource when the screen locks   | snapshot on reconnect (ADR 0004); e2e reconnect test                | pending                                                                                                           |
| Scope (54 ACs) vs 6 days                             | circuit breaker above; re-estimate after slice 1                    | pending                                                                                                           |
