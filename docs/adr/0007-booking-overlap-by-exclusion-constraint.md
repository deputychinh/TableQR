# ADR 0007: Booking overlap prevented by a Postgres exclusion constraint

- Status: accepted · 2026-11-08

## Context

Two guests may book the last suitable table for the same slot at the same moment; exactly one must win (AC50).

## Decision

A booking reserves a concrete table at creation (the smallest free table with enough seats). `bookings` has `EXCLUDE USING gist (table_id WITH =, slot WITH &&) WHERE (status IN ('pending','confirmed','seated'))` (extension `btree_gist`). The service tries candidate tables in order; a constraint violation moves to the next candidate; none left → "no free table" with the nearest free times.

## Consequences

- Correct under any concurrency without serialisable transactions.
- Staff can reassign the table on confirmation; the same constraint guards the reassignment.
- Requires the `btree_gist` extension in the first booking migration.
