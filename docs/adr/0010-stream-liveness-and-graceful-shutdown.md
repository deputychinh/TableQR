# ADR 0010: Stream liveness with a named heartbeat, and ending streams on shutdown

- Status: accepted · 2026-11-08
- Supersedes, in [ADR 0004](0004-realtime-sse-with-postgres-notify.md) (accepted; left unedited per the repo rule): **decision 1's clause "plus a heartbeat comment every 15 s"** — replaced by the named `heartbeat` event below — and **decision 1's list of events a stream sends**, which gains `heartbeat`, `bye` and (already sent since TQR-010) `revoked`. Decision 3 ("clients treat the snapshot as the truth on every (re)connect") is kept and now also covers reconnects the client starts itself. Decisions 2 and 4 and all of ADR 0004's consequences stand unchanged.

## Context

Two faults were found after the kitchen voice made the stream the cook's only signal (TQR-031, TQR-032):

1. With the API down behind the Vite or nginx proxy, the browser's EventSource can stay "open" (`readyState` 1) while nothing arrives: ADR 0004's heartbeat is an SSE comment, which EventSource never surfaces, so the client cannot tell a quiet stream from a dead one. The kitchen screen silently stopped showing and reading new orders. A proxy answering 502 also makes EventSource give up for good (`readyState` 2), with no retry.
2. `app.close()` (SIGTERM, `nest --watch` restarts) waited for every open stream, because closing the HTTP server waits for open connections and a proxy keeps SSE connections open for as long as the browser is there.

## Decision

1. Every stream sends `event: heartbeat` with `{intervalMs}` right after its first snapshot and then every `TQR_SSE_HEARTBEAT_MS` (default 15 s), instead of the comment.
2. The client (`useStream`) restarts a watchdog on every event; **no event for 2.5 heartbeats means dead**: it closes the EventSource, sets status `reconnecting` and opens a new one after a backoff of at most 1, 2, 5, then every 10 s, each wait jittered to half…all of its step (reset by a snapshot) — capped at 10 s so a restarted API has its kitchens back within ~10 s, jittered so a room of screens does not reconnect in lockstep. The same happens on `bye` and when the browser gives up on the connection. The snapshot on reconnect repairs state as before.
3. A stream whose access ended is not reconnected: on `revoked`, or when the browser gives up and the session check (`/api/me`) answers 401, the status becomes `ended` — no banner, no spoken "Mất kết nối" — and staff screens go to sign-in (AC16) through the API client's unauthorized handler. A proxy 502 or a network failure is still retried.
4. Every screen that follows a stream shows the same banner while it reconnects (`StreamBanner`, `role="status"`, "Mất kết nối — đang kết nối lại…"). The kitchen voice says "Mất kết nối máy chủ" once when the stream has been down for 5 s while the voice is on, and "Đã kết nối lại" when it is back.
5. On shutdown `StreamGate` (`beforeApplicationShutdown`, run by `enableShutdownHooks` before Nest closes the HTTP server) aborts a signal every open stream listens to: each sends `event: bye` and ends its response; a stream opening after that ends at once.

## Consequences

- A dead stream is noticed within 37.5 s at the default heartbeat (lower `TQR_SSE_HEARTBEAT_MS` to notice sooner, at the cost of more bytes per open screen).
- Restarts and deploys finish at once; clients reconnect on their own backoff instead of hanging on to a half-closed process.
- Old clients ignore the new `heartbeat` and `bye` events (EventSource drops unknown named events unless listened to), so the change is backward compatible.
- Tests: `sse.spec.ts` (heartbeat, `bye`), `test/shutdown.e2e-spec.ts` (`app.close()` < 2 s with four open streams), `useStream.test.ts` (fake timers + fake EventSource), `kitchen.test.ts` and the Playwright journey that blocks the stream and hears the warning.
