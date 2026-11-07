# TableQR — design

Spec: `spec.md` · ADRs: [0001](../../adr/0001-stack-and-layout.md) · [0002](../../adr/0002-same-origin-api-and-cookie-sessions.md) · [0003](../../adr/0003-tenant-scoping.md) · [0004](../../adr/0004-realtime-sse-with-postgres-notify.md) · [0005](../../adr/0005-kitchen-queue-order.md) · [0006](../../adr/0006-vietqr-payload-and-manual-confirmation.md) · [0007](../../adr/0007-booking-overlap-by-exclusion-constraint.md) · Updated: 2026-11-08

## Sizing (back of the envelope)

| Quantity                      | Assumption                                                                    | Result                                         |
| ----------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------- |
| Restaurants in the first year | HYPOTHESIS 200, ≈ 20 tables each                                              | 4 000 tables                                   |
| Peak concurrent open sessions | 50 % of tables at dinner peak                                                 | 2 000 sessions                                 |
| Live connections              | 2 phones per session + 3 staff screens per restaurant                         | ≈ 4 600 SSE streams                            |
| Writes at peak                | 1 order per session per 10 min + 4 status changes per item, 4 items per order | ≈ 3.3 orders/s, ≈ 55 writes/s                  |
| Data per year                 | 200 × 300 orders/day × 4 items × 300 B                                        | ≈ 22 GB incl. indexes — one Postgres is plenty |

One API process and one Postgres meet this by an order of magnitude; nothing forces a split (monolith first).

## Driving characteristics

| Characteristic                | Target (from spec)                                             | Fitness function                                                                                                          | Benchmark row                                                   |
| ----------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Fairness (serving order)      | 0 out-of-order serves without a recorded skip                  | rush-replay integration test; queue-order unit tests (property style)                                                     | [`benchmarks/plan.md`](../../../benchmarks/plan.md) Rush replay |
| Tenant isolation              | 0 cross-tenant reads or writes                                 | e2e matrix: every endpoint called with tenant B's ids as tenant A → 404; lint: repository functions take `TenantId` first | —                                                               |
| Realtime freshness            | status change visible ≤ 2 s p95                                | realtime bench script (SSE clients measure delay)                                                                         | Cook marks item done → screens updated                          |
| Correctness under concurrency | no duplicate order, one booking per slot, one payment per bill | e2e tests firing parallel requests (AC23, AC24, AC45, AC50)                                                               | —                                                               |
| Guest page speed on phones    | LCP ≤ 2.5 s, JS ≤ 150 kB gzip                                  | Lighthouse CI + bundle budget in `make ci`                                                                                | Guest menu cold load                                            |
| Order latency                 | p95 ≤ 300 ms                                                   | k6                                                                                                                        | Guest submits a 5-line cart                                     |

Deliberately ignored for now: multi-region availability, horizontal scaling, offline ordering.

## Context map

```mermaid
flowchart LR
  guest((Guest phone)) --> web
  staff((Staff iPad)) --> web
  web[Vue SPA<br/>/ (same origin)] -->|/api JSON + SSE| api
  subgraph api[NestJS modular monolith]
    identity[Identity & tenants]
    setup[Restaurant setup<br/>menu · tables · rules]
    service[Service floor<br/>sessions · orders · kitchen · serve]
    billing[Billing<br/>bills · VietQR · payments]
    booking[Booking]
    realtime[Realtime hub]
  end
  api --> db[(Postgres 17)]
  db -. NOTIFY .-> realtime
```

| Context            | Kind       | Owns                                                                            | Talks to                                                   |
| ------------------ | ---------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Service floor      | **core**   | table sessions, orders, order items, queue order, anomaly check                 | setup (menu, rules), billing (supersede bill), realtime    |
| Billing            | supporting | bills, bill codes, VietQR payload, payment records                              | service floor (session items)                              |
| Booking            | supporting | bookings, slot availability                                                     | setup (tables, rules), service floor (seat → open session) |
| Restaurant setup   | supporting | restaurant profile, house rules, stations, categories, items, tables, QR tokens | identity                                                   |
| Identity & tenants | generic    | users, roles, auth sessions, login throttling, platform admin                   | —                                                          |
| Realtime hub       | generic    | SSE streams per topic                                                           | Postgres LISTEN                                            |

One transaction per use case; contexts call each other through service interfaces inside the process, never through each other's tables.

## Domain logic kept pure (`src/<context>/domain/*.ts`, no Nest, no Drizzle)

- `anomaly.ts` — `checkOrder(partySize, mainPortionsBefore, mainPortionsInOrder, rules) → 'ok' | 'hold' | 'flag-short'` (AC26–AC29).
- `queue.ts` — `compareQueueItems(a, b)` by `(releasedAt, sessionOpenedAt, itemId)`; `findSkippedOlder(item, stationItems)` (AC30, AC32).
- `house-rules.ts` — zod schema + defaults for rules (S4).
- `vietqr.ts` — EMVCo TLV builder + CRC-16/CCITT-FALSE + decoder for tests (AC40, AC43).
- `bill-code.ts` — 5-char Crockford base32 code (no 0/O/1/I confusion).
- `slots.ts` — booking slot range, opening-hours check, nearest free times (AC48–AC49).
- `party.ts` — party size bounds (1 … seats + 4).

## Data

Every tenant table has `restaurant_id`; child tables reference parents with composite keys `(restaurant_id, id)` so a row can never point into another tenant (ADR 0003).

| Table                                  | Key columns                                                                                                                                                                             | Notes                                                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `restaurants`                          | id, name, slug unique, status `active/suspended`, rules jsonb, bank_bin, bank_account, bank_account_name, opening_hours jsonb                                                           | rules validated by `house-rules.ts` on write                                                                             |
| `users`                                | id, restaurant_id null for platform admin, email unique (lower-cased), password_hash, role, disabled_at                                                                                 | roles: owner, cashier, waiter, kitchen, platform_admin                                                                   |
| `auth_sessions`                        | token_hash pk, user_id, restaurant_id, expires_at, last_seen_at                                                                                                                         | 12 h sliding, deleted on logout/disable (AC16)                                                                           |
| `login_attempts`                       | email, attempted_at, succeeded                                                                                                                                                          | window query for AC4; purged after 1 day                                                                                 |
| `stations`, `categories`, `menu_items` | restaurant_id + id; item: category_id, station_id, name, price_vnd int, available, is_main via category                                                                                 | price check `1000..100000000`                                                                                            |
| `dining_tables`                        | restaurant_id, id, name, seats 1–30, qr_token unique (128-bit random, base64url), qr_rotated_at                                                                                         | rotate → old token 410 "expired" (keep `previous_tokens` for message)                                                    |
| `table_sessions`                       | restaurant_id, id, table_id, party_size, status `open/closed`, opened_at, closed_at, close_reason, booking_id                                                                           | **partial unique index** `(table_id) where status='open'` → one open session per table                                   |
| `guest_devices`                        | token_hash pk, session_id, restaurant_id, created_at                                                                                                                                    | cookie per phone; dies with the session (AC21)                                                                           |
| `orders`                               | restaurant_id, id, session_id, idempotency_key, status `held/awaiting_payment/released/rejected`, requested_at, released_at, queue_at, hold_reason, total_vnd                           | **unique (session_id, idempotency_key)** (AC24)                                                                          |
| `order_items`                          | restaurant_id, id, order_id, session_id, station_id, menu_item_id, name/price snapshots, qty 1–20, note ≤ 140, status, queue_at, started_at, done_at, served_at, served_by, skip_reason | index `(restaurant_id, station_id, status, queue_at, session_opened_at, id)` for the station queue                       |
| `bills`                                | restaurant_id, id, session_id, code unique per restaurant, amount_vnd, status `open/superseded/paid`, created_at, paid_at, paid_by, method `transfer/cash`                              | paying = `update … where status='open'` → 0 rows means already paid/superseded (AC42, AC45)                              |
| `bookings`                             | restaurant_id, id, table_id, party_size, guest_name, guest_phone, slot tstzrange, status `pending/confirmed/seated/cancelled/no_show`                                                   | **exclusion constraint** `(table_id with =, slot with &&) where status in (pending, confirmed, seated)` (AC50, ADR 0007) |

| Flow           | Source of truth                   | Derived                                   | Idempotency                                                        | PII / retention                                          |
| -------------- | --------------------------------- | ----------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------- |
| Guest order    | `orders`, `order_items`           | station queues, guest status view, totals | client UUID per submit, unique per session                         | none                                                     |
| Item status    | `order_items.status` + timestamps | SSE events                                | status transitions are compare-and-set (`where status = expected`) | staff user id on serve                                   |
| Bill & payment | `bills`                           | guest "paid" view                         | one `open` bill per session; pay is compare-and-set                | cashier user id                                          |
| Booking        | `bookings`                        | day list, free times                      | exclusion constraint; client UUID retried → same booking           | name + phone: deleted 30 days after the slot (daily job) |
| Staff identity | `users`, `auth_sessions`          | —                                         | —                                                                  | email; password as scrypt hash only                      |

Migrations: Drizzle SQL files, expand → migrate → contract; no destructive migration without an ADR.

## Integration points

| Dependency                 | Timeout                                          | Retry                                                           | Breaker / bulkhead                                             | Fallback                                                                 |
| -------------------------- | ------------------------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Postgres (queries)         | `statement_timeout` 5 s, pool 10, connect 3 s    | none in requests (client retries with the same idempotency key) | pool is the bulkhead; SSE uses one dedicated LISTEN connection | 503 problem `DB_UNAVAILABLE`; UI shows retry                             |
| Postgres LISTEN connection | keepalive 30 s                                   | reconnect with backoff 0.5 s → 10 s + jitter                    | —                                                              | on reconnect every SSE client receives `resync` and reloads its snapshot |
| Browser SSE                | heartbeat every 15 s                             | EventSource auto-reconnect; client refetches snapshot on `open` | max 10 streams per guest device, 50 per staff user             | polling fallback is **not** built (rejected: doubles load)               |
| Bank (VietQR)              | none — we only render a payload; no network call | —                                                               | —                                                              | no bank account configured → "Thanh toán tại quầy" (AC41)                |

No AI calls in this delivery.

## API shape (contract-first, OpenAPI from Nest, RFC 9457 errors with `code`)

- Staff: `/api/auth/*`, `/api/restaurant`, `/api/menu/*`, `/api/tables/*`, `/api/staff/*`, `/api/sessions/*`, `/api/kitchen/stations/:id/queue`, `/api/items/:id/status`, `/api/bills/*`, `/api/bookings/*`, `/api/admin/restaurants/*`.
- Guest: `/api/g/t/:qrToken` (resolve table + restaurant + menu), `/api/g/session` (check-in/join), `/api/g/orders`, `/api/g/bill`, `/api/g/r/:slug/bookings`.
- Streams: `/api/stream/station/:id`, `/api/stream/floor` (waiter/cashier), `/api/g/stream` (guest session).
- Writes accept `Idempotency-Key` header where retried by clients (orders, bookings). Bodies validated with zod (unknown keys rejected). Lists paginated, max 200.

## Decisions

| ADR                                                               | Decision                                                                                                                                                                                                 | Rejected options                                                                                                                                         |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0002](../../adr/0002-same-origin-api-and-cookie-sessions.md)     | Web and API on one origin (`/api` proxied); staff auth by opaque server-side session in an HttpOnly cookie; guest devices by a separate random cookie bound to one table session; scrypt password hashes | JWT in localStorage (XSS-stealable, no revoke); cross-origin cookies (SameSite=None, CORS credentials); OIDC provider (no host yet, overkill for owners) |
| [0003](../../adr/0003-tenant-scoping.md)                          | Tenant id only from the authenticated principal; every repository call takes `TenantId`; composite FKs `(restaurant_id, id)`; 404 on foreign ids                                                         | Postgres RLS now (deferred: needs per-transaction `set_config`, revisit before multi-host deploy); schema per tenant (migration fan-out)                 |
| [0004](../../adr/0004-realtime-sse-with-postgres-notify.md)       | Server-Sent Events + `pg_notify` inside the writing transaction; snapshot on (re)connect, small deltas after                                                                                             | WebSocket (bidirectional not needed, more moving parts); polling (load and 2 s target); Redis pub/sub (extra infra for one process)                      |
| [0005](../../adr/0005-kitchen-queue-order.md)                     | Queue key `(queue_at, session_opened_at, item id)`; `queue_at` = request time (held orders keep it), = payment time for pay-before-cooking; skips allowed only with a recorded reason                    | Free-form kitchen order; sequence numbers per station (gaps and locks)                                                                                   |
| [0006](../../adr/0006-vietqr-payload-and-manual-confirmation.md)  | Build the EMVCo/NAPAS VietQR payload ourselves (pure function, CRC tested), QR rendered client-side; cashier confirms against the bill code in the memo; payment port ready for PayOS/SePay              | Image API from a third party (network, privacy, outage); automatic reconciliation now (paid accounts)                                                    |
| [0007](../../adr/0007-booking-overlap-by-exclusion-constraint.md) | Bookings hold a tentative table at creation; Postgres `EXCLUDE USING gist` forbids overlapping active bookings per table                                                                                 | App-level check then insert (race, AC50); serialisable transactions with retries                                                                         |

## Spec changes from design

- 2026-11-08 Release time for "pay before cooking" orders = payment confirmation time (ADR 0005); glossary updated.
