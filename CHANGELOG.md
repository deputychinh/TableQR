# Changelog

Follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [SemVer](https://semver.org/). One version for every deployable in this repo.

## [Unreleased]

### Added

- Menu: kitchen stations (default "Bếp", late-after minutes), categories with the main-dish flag and ordering, items with whole-VND prices (1 000–100 000 000) and a "hết món" switch the kitchen may also use; public guest menu `GET /api/g/r/:slug/menu` with the owner's "Xem như khách" preview; shared `ToggleSwitch`, `StatusChip`, `TextAreaField`, `NumberField`; owner content now scrolls between the header and bottom bar (TQR-006).
- Platform admin: `npm run admin:create` CLI (no sign-up screen), `/api/admin/restaurants` list with suspend / reactivate, `/quan-tri` screen; a suspended restaurant's staff are signed out at once and refused at sign-in ("Nhà hàng tạm ngưng"); reusable `assertRestaurantActive` for guest pages (TQR-009).
- Staff accounts: owner adds cashier / waiter / kitchen people, changes roles, disables (sessions end at once), re-enables and sets a new password; no self lock-out, always one active owner; role homes `/thu-ngan`, `/phuc-vu`, `/bep` with sign-in landing per role; AC15 role matrix e2e covering staff, settings, tables and admin endpoints; staff pages respect `meta.roles` (tables list also for cashier / waiter); shared `StatusChip`; `make e2e` honours the database name in `E2E_DATABASE_URL` (TQR-005).
- Realtime hub: Server-Sent Events with Postgres NOTIFY published inside transactions, per-restaurant topics, reconnect with resync, staff floor stream, `useStream` composable (TQR-010).
- House rules and bank account settings: owner screen `/quan-ly/cai-dat` (payment timing, session opening, order approval, anomaly thresholds, booking slot and opening hours, VietQR bank account with live preview and confirm sheet, unsaved-changes guard), `GET/PUT /api/restaurant/settings` (owner only, audit line without the account number), `GET /api/restaurant/rules` for every role, versioned rules with a snapshot function for AC12; shared `RadioCardGroup`, `NumberStepper`, `ConfirmSheet`, `SelectField`, `LoadingState`, `ErrorState` (TQR-008).
- Tables and QR codes: owner adds, edits and deletes tables (name 1–30, seats 1–30), each with a 128-bit QR token; printable A4 QR sheet (all tables or one); "Đổi mã QR" rotation with the old code showing "Mã QR đã hết hạn"; public guest table page `/t/:qrToken` (expired / not found states); shared `BaseSheet`, `ConfirmSheet`, `EmptyState`, `ErrorState`, `LoadingState`, `NumberStepper` components (TQR-007).
- Restaurant sign-up, staff sign-in/out with cookie sessions (scrypt, rotation, 12 h sliding expiry), login throttling, Origin check; landing page, sign-up, sign-in and owner overview screens with the shared design-system components (TQR-004).
- Benchmark harness: `make bench` (k6, p95 and error thresholds), `make budget` (initial JS ≤ 150 kB gzip, in `make ci`), `make lighthouse` (LCP ≤ 2.5 s, mobile slow 4G), `make baseline` → `benchmarks/baseline.json` (TQR-003).
- API under `/api` on the web app's origin (Vite proxy), RFC 9457 problem responses with stable `code`, 32 kB JSON body limit, JSON request logs with request id and route pattern, redaction of tokens and personal data (TQR-002).
- Walking skeleton: NestJS API with `/health` checking Postgres (Drizzle), Vue web page showing system status in Vietnamese, Testcontainers e2e and Playwright smoke + axe on iPhone and iPad.
- Repository bootstrap: tooling (Prettier, EditorConfig, husky + commitlint), Makefile, CI, docs skeleton (conventions, testing, ADR 0001, architecture, plan, backlog).
