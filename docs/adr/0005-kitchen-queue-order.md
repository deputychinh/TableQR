# ADR 0005: Kitchen queue order and skips

- Status: accepted · 2026-11-08

## Context

The owner's core complaint: a table that arrived later gets its food first. Orders can be held for staff confirmation (AC26, AC28) or for payment (AC13).

## Decision

1. Each order item carries `queue_at`. For a normal or held order it is the time the guest submitted the order (holding for confirmation does not cost the guest their place). For "pay before cooking" it is the payment confirmation time (the kitchen could not start earlier).
2. A station queue lists items in `waiting` or `cooking` ordered by `(queue_at, session_opened_at, item_id)` — `compareQueueItems` in `service/domain/queue.ts` is the only implementation; SQL `ORDER BY` uses the same columns and a test asserts both agree.
3. Marking an item `done` while an older `waiting/cooking` item of the same menu item at the same station exists requires `skipReason`; the skip is stored and shown in the day report (AC32).
4. Status transitions are compare-and-set (`waiting → cooking → done → served`, `* → cancelled` only before `done`).

## Consequences

- Fairness is checkable after the fact: an item served before an older one without a skip reason is a bug (rush-replay fitness function).
- Cooks keep freedom to batch different dishes; only same-dish overtaking is gated.
