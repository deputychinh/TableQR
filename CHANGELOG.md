# Changelog

Follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [SemVer](https://semver.org/). One version for every deployable in this repo.

## [Unreleased]

### Added

- API under `/api` on the web app's origin (Vite proxy), RFC 9457 problem responses with stable `code`, 32 kB JSON body limit, JSON request logs with request id and route pattern, redaction of tokens and personal data (TQR-002).
- Walking skeleton: NestJS API with `/health` checking Postgres (Drizzle), Vue web page showing system status in Vietnamese, Testcontainers e2e and Playwright smoke + axe on iPhone and iPad.
- Repository bootstrap: tooling (Prettier, EditorConfig, husky + commitlint), Makefile, CI, docs skeleton (conventions, testing, ADR 0001, architecture, plan, backlog).
