# Backlog

Source: `docs/delivery/001-qr-table-ordering/plan.md` (ACs per item there).

| Id      | Item                                                         | Status |
| ------- | ------------------------------------------------------------ | ------ |
| TQR-001 | Walking skeleton                                             | done   |
| TQR-002 | Same-origin `/api`, RFC 9457 errors, redacted request logs   | done   |
| TQR-003 | Benchmark harness + baseline                                 | doing  |
| TQR-004 | Restaurant sign-up, staff sign-in/out, sessions, throttling  | doing  |
| TQR-005 | Staff accounts and role guard                                | review |
| TQR-006 | Menu: stations, categories, items, availability              | review |
| TQR-007 | Tables, QR tokens, printable QR sheet, rotation              | review |
| TQR-008 | House rules and bank account settings                        | review |
| TQR-009 | ~ Platform admin suspend / reactivate                        | review |
| TQR-010 | Realtime hub: SSE + pg_notify + resync (spike first)         | review |
| TQR-011 | Guest check-in / join table session                          | review |
| TQR-012 | Guest menu and ordering (idempotent, price check)            | review |
| TQR-013 | Anomaly check, held orders, waiter confirm/reject            | review |
| TQR-014 | Kitchen station queue (FIFO, skip reason, late highlight)    | todo   |
| TQR-015 | Waiter ready list and serve                                  | todo   |
| TQR-016 | Guest live dish status + realtime and rush-replay benchmarks | review |
| TQR-017 | Tenant isolation and role e2e matrix                         | todo   |
| TQR-018 | Bill with VietQR payload                                     | review |
| TQR-019 | Cashier confirm, close session, pay-before-cooking           | review |
| TQR-020 | Guest table booking (exclusion constraint)                   | review |
| TQR-021 | Staff booking list: confirm, seat, cancel, late              | review |
