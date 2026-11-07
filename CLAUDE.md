# TableQR

Multi-tenant web app (iPad and phone first) that puts a QR code on every restaurant table: guests order, follow each dish and pay by VietQR transfer; the kitchen serves tables strictly in arrival order; each restaurant sets its own operating rules.

Stack: NestJS (TypeScript strict) + Drizzle + PostgreSQL 17 API in services/api; Vite + Vue 3 + Pinia + Vue Router + vue-i18n web app in web/. Docs language: English. Everything below is binding for every session in this repo.

## Delivery profile

Skills read these keys; a key left out falls back to the default in the skills README.

- reply language: Vietnamese
- frontend default: Vue 3
- backend default: Node (TypeScript)
- mobile: web only (responsive, iPad + phone first); no native apps
- autonomy: decide-and-record — ask only what nobody else can answer (secrets, money, legal, irreversible or outward-facing actions)
- push policy: push every green commit to `origin` (https://github.com/deputychinh/TableQR)
- review gate: independent review, ship at ≥ 9/10 with requirements fit = 1 and security ≥ 0.5, at most 3 improve rounds
- deploy target: local only (until the owner names one)
- tenancy: multi-tenant — each restaurant self-registers, own data and own operating rules (house rules)
- payment: VietQR (EMVCo) per restaurant bank account, staff confirms receipt manually; PayOS/SePay adapter later

## Sources of truth (read before changing code)

| Task                                                        | Read                                                              |
| ----------------------------------------------------------- | ----------------------------------------------------------------- |
| Code conventions, naming, folder layout                     | `docs/conventions.md`                                             |
| Testing: which layer, where it runs, which threshold        | `docs/testing.md`                                                 |
| Why this stack and layout; every decision with consequences | `docs/adr/` (a new ADR is a new file; never edit an accepted ADR) |
| Current architecture                                        | `docs/architecture/README.md`                                     |
| Work in progress and what comes next                        | `docs/plan.md`, `docs/backlog.md`                                 |
| Commands to run, build, test                                | `make help`                                                       |

## Commands

```sh
make install   # dependencies
make dev       # infra, migrations, API and web together
make lint      # format check + lint + typecheck for every part
make test      # unit + API/component tests with coverage
make ci        # = lint + test + script tests + e2e + bundle budget, exactly what CI runs
```

Use the Makefile target rather than calling npm or uv directly, unless you are debugging that target:
the target is what CI runs, so a direct call can pass where CI fails.

## Definition of done

A task is done only when all of these hold:

1. Code follows `docs/conventions.md` (lint 0 warnings, typecheck clean).
2. New behaviour or a fixed bug has a test; coverage stays at or above the thresholds in `docs/testing.md`.
3. `make ci` is green and its result (tests run, tests passed) is pasted in the report.
4. Docs change in the same commit: `CHANGELOG.md` under `[Unreleased]`, the README if usage changed, an ADR if a decision changed.
5. The work is committed (routine below).

## Routine for every turn that changes files

1. Run the gates of every part you touched (`make lint && make test`, or that part's equivalent).
2. Update CHANGELOG and docs in the same change.
3. `git add` only the files of this task (no `git add -A` when the tree holds unrelated files), then `git commit` with a Conventional Commit whose scope is in `commitlint.config.mjs`.
   - One commit per complete unit of work (code + test + docs). Several commits in one turn are fine.
4. Commit only when green. If the gates are red at the end of the turn, **do not commit**: say what fails and why, and leave the tree dirty on purpose.
5. Push per the push policy above: with `push every green commit` and an `origin`, push each green commit to `origin main`; otherwise commits stay local. Never rebase or force-push `main`.
6. End the report with the hash and message of each new commit.

## Delivery loop

After bootstrap, work through the backlog with the `deliver-loop` skill: each item goes through story → design → TDD → QA → an independent 10-point review (the skill's `rubric.md`) → improve until it scores ≥ 9 → commit. Requests that are not a backlog item start with `ship`.

## Working style

- Finish a whole phase (see `docs/plan.md`) without stopping to ask; ask only for what only the user has (a business rule, a secret, a choice between two patterns with different consequences).
- Make the smallest change that meets the request; no refactors outside its scope, no new library when the stack already has a way.
- Never swallow errors; domain errors carry a stable code and are mapped to HTTP/UI exactly once at the boundary.
- Never log personal data, secrets or tokens. `.env` never enters git; `.env.example` always lists every key.
- Display strings live in locale files, never hard-coded in components.
- When the change is visible, take a screenshot or run the e2e suite; do not describe the UI from memory.

## Language

Reply in the language of the delivery profile (default: the language the user writes in). Technical names, commands and commit messages stay in English. Docs in this repo are written in English.

## Product rules (from the owner, binding)

- UI copy is Vietnamese (vue-i18n `vi` locale is the source of truth); code, docs and commits English.
- Every query is scoped by `restaurantId` from the authenticated staff session or the table token — never from the request body. Cross-tenant access answers 404.
- Kitchen queue order is by release time (spec glossary); never reorder silently.
- Current delivery ledger: `docs/delivery/001-qr-table-ordering/status.md`.
- UI must be easy and friendly, built from one set of patterns (`docs/design-system.md`): same app shell per role, same buttons, lists, forms, status chips and empty/error states everywhere; large touch targets for phones and kitchen iPads; plain Vietnamese copy that tells people what to do next. A new screen reuses these patterns before inventing one.
