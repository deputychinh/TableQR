# ADR 0004: Realtime updates with Server-Sent Events and Postgres NOTIFY

- Status: accepted · 2026-11-08

## Context

Guests, waiters and the kitchen must see item status changes within 2 s p95 (AC31, AC38) and recover after a dropped connection within 5 s (AC39). All writes go through HTTP already; updates only flow server → client.

## Decision

1. One SSE endpoint per audience: station queue, floor (waiter/cashier), guest session. Each stream sends `snapshot` on open, then `delta` events (`{type, id, status, version}`), plus a heartbeat comment every 15 s.
2. Writers call `pg_notify('tqr', json)` inside the same transaction as the change, so an event is published only if the change commits. One dedicated connection per API process `LISTEN`s and fans events out to in-process subscribers filtered by restaurant and topic.
3. Clients treat the snapshot as the truth: on every (re)connect they replace local state; deltas carry a version and are ignored when older than what the client has.
4. On LISTEN reconnect the hub sends `resync` to every stream.

## Consequences

- Works through ordinary HTTP proxies; iOS Safari supports EventSource.
- Horizontal scaling works as-is (every process LISTENs). NOTIFY payloads stay under 8 000 bytes by sending ids, not documents.
- WebSocket was rejected (two-way not needed); polling was rejected (2 s target × thousands of devices); Redis pub/sub was rejected (extra infrastructure for a single process).
