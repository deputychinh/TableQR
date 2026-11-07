# ADR 0001: Stack and repository layout

- Status: accepted · 2026-11-08

## Context

Multi-tenant web app (iPad and phone first) that puts a QR code on every restaurant table: guests order, follow each dish and pay by VietQR transfer; the kitchen serves tables strictly in arrival order; each restaurant sets its own operating rules. Constraints: owner profile asks for Vue 3 and Node TypeScript; web only; several restaurants share one deployment; realtime status for guests, kitchen and waiters; local only until a host is named.

## Decision

1. Stack: NestJS (TypeScript strict) + Drizzle + PostgreSQL 17 API in services/api; Vite + Vue 3 + Pinia + Vue Router + vue-i18n web app in web/.
2. One repository; deployables in their own folders with their own manifests; repo-level tooling (Prettier, husky, commitlint) at the root.
3. Layered backend (controllers → services → domain, ports for I/O; pure domain logic such as queue order, anomaly check, VietQR payload in plain TypeScript with unit tests); feature-sliced frontend.
4. Drizzle over Prisma: SQL-first schema in TypeScript, plain SQL migrations reviewable in the diff, no generated engine binary; row-level tenant scoping stays visible in each query (references/backend-architecture.md, data-and-reliability.md).
5. Vite SPA, no SSR: the guest page is reached by QR, not by search, so SEO does not matter; an SPA keeps one deployable for all roles.
6. Quality gates: API ESLint + tsc + Vitest (≥ 90 % on domain and services) + e2e on a real Postgres; web ESLint 0 warnings + vue-tsc + Vitest ≥ 80 % + Playwright with axe; Conventional Commits enforced by hooks and CI.

## Consequences

- Product design decisions (realtime transport, auth, tenancy enforcement, data model) belong to the architect stage and get their own ADRs.
- Postgres runs in Docker locally on port 55432 to avoid clashing with other local databases.
