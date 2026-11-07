# ADR 0003: Tenant scoping in the application with composite keys

- Status: accepted · 2026-11-08

## Context

Many restaurants share one database (owner ruling). A leak of another restaurant's orders, bills or bookings is the worst failure (spec AC3). Options: Postgres row-level security, one schema per tenant, or application scoping.

## Decision

1. The tenant id (`restaurantId`) comes only from the authenticated staff session or from the guest's table token / guest cookie — never from a path parameter or body.
2. Every repository method takes a branded `TenantId` as its first argument and puts `restaurant_id = $tenant` in every query; a unit-level lint check (grep in CI) fails on a repository query without it.
3. Child rows reference parents with composite foreign keys `(restaurant_id, id)`, so the database refuses a row that points into another tenant even if a query is wrong.
4. A foreign id answers 404 `NOT_FOUND`, the same as a missing id.
5. A suspended restaurant (S16) is refused at the guard that resolves the tenant.

## Consequences

- The isolation e2e matrix (tenant A calls every endpoint with tenant B's ids) is a fitness function in `make ci`.
- RLS is the next hardening step before a multi-host deployment; it can be added without changing the API because all queries already carry the tenant id.
- Schema per tenant was rejected: migrations would fan out over hundreds of schemas.
