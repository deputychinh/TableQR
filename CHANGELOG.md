# Changelog

Follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [SemVer](https://semver.org/). One version for every deployable in this repo.

## [Unreleased]

### Added

- Tables and QR codes: owner adds, edits and deletes tables (name 1–30, seats 1–30), each with a 128-bit QR token; printable A4 QR sheet (all tables or one); "Đổi mã QR" rotation with the old code showing "Mã QR đã hết hạn"; public guest table page `/t/:qrToken` (expired / not found states); shared `BaseSheet`, `ConfirmSheet`, `EmptyState`, `ErrorState`, `LoadingState`, `NumberStepper` components (TQR-007).
- Restaurant sign-up, staff sign-in/out with cookie sessions (scrypt, rotation, 12 h sliding expiry), login throttling, Origin check; landing page, sign-up, sign-in and owner overview screens with the shared design-system components (TQR-004).
- Benchmark harness: `make bench` (k6, p95 and error thresholds), `make budget` (initial JS ≤ 150 kB gzip, in `make ci`), `make lighthouse` (LCP ≤ 2.5 s, mobile slow 4G), `make baseline` → `benchmarks/baseline.json` (TQR-003).
- API under `/api` on the web app's origin (Vite proxy), RFC 9457 problem responses with stable `code`, 32 kB JSON body limit, JSON request logs with request id and route pattern, redaction of tokens and personal data (TQR-002).
- Walking skeleton: NestJS API with `/health` checking Postgres (Drizzle), Vue web page showing system status in Vietnamese, Testcontainers e2e and Playwright smoke + axe on iPhone and iPad.
- Repository bootstrap: tooling (Prettier, EditorConfig, husky + commitlint), Makefile, CI, docs skeleton (conventions, testing, ADR 0001, architecture, plan, backlog).
