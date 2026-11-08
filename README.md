# TableQR

**QR ordering at every restaurant table — fair kitchen queue, VietQR payment, per-restaurant house rules.**

| Screen 1                                | Screen 2                                |
| --------------------------------------- | --------------------------------------- |
| ![](docs/screenshots/placeholder-1.png) | ![](docs/screenshots/placeholder-2.png) |

## Quick start

Requires: Node ≥ 24 and Docker (Postgres runs in a container on port 55432).

```sh
make install   # dependencies
make dev       # infrastructure, migrations, API and web together
```

Open http://localhost:5310 (web); the API listens on http://127.0.0.1:3310. Optional: `cp .env.example .env` to override settings. `make help` lists every command.

The platform admin (suspends abusive restaurants at `/quan-tri`) has no sign-up screen; create one with `cd services/api && TQR_ADMIN_PASSWORD='…' npm run admin:create -- --email admin@example.com` (the password is read from the environment and never printed).

## Features

- **Owner:** self sign-up, house rules (pay before/after eating, who opens a table, order approval, portions per person), VietQR bank account, menu with kitchen stations, tables with printable QR codes, staff accounts per role.
- **Guest (phone, no app):** scan the table QR, party size, order, live status per dish, bill with a VietQR code that follows new orders, online table booking at `/r/<slug>/dat-ban`.
- **Kitchen (`/bep`):** one queue per station, oldest first; overtaking the same dish needs a reason.
- **Waiter (`/phuc-vu`):** ready dishes per table, unusual orders to confirm (`/phuc-vu/duyet`).
- **Cashier (`/thu-ngan`):** confirm transfers against the bill code, close tables.

Results of release 1: [docs/delivery/001-qr-table-ordering/demo.md](docs/delivery/001-qr-table-ordering/demo.md).

## Architecture

```mermaid
flowchart LR
  web[Vue web app<br/>guest · kitchen · waiter · cashier · owner] -->|HTTP JSON| api[NestJS API]
  api --> db[(PostgreSQL)]
```

Details: [docs/architecture/README.md](docs/architecture/README.md) · decisions: [docs/adr](docs/adr) · conventions: [docs/conventions.md](docs/conventions.md) · tests: [docs/testing.md](docs/testing.md).

## Quality

`make ci` = lint + typecheck + unit tests + e2e (real Postgres via Testcontainers, Playwright on iPhone and iPad) for every part (thresholds in `docs/testing.md`); GitHub Actions runs the same. Commits follow Conventional Commits (scopes in `commitlint.config.mjs`), enforced by husky + commitlint.

## Structure

```
services/api/  API — NestJS, Drizzle, PostgreSQL, ESLint, Vitest
web/           web app — Vue 3 (TS strict, ESLint, Stylelint, Vitest, Playwright)
deploy/        production header set and an nginx example (SPA + /api proxy; see docs/security.md)
docs/          plan, ADRs, architecture, conventions, testing, screenshots
```

## Licence and data

Private project. No real guest data in the repo; seeds are fictional.
