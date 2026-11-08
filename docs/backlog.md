# Backlog

Source: `docs/delivery/001-qr-table-ordering/plan.md` (ACs per item there).

| Id      | Item                                                                       | Status |
| ------- | -------------------------------------------------------------------------- | ------ |
| TQR-001 | Walking skeleton                                                           | done   |
| TQR-002 | Same-origin `/api`, RFC 9457 errors, redacted request logs                 | done   |
| TQR-003 | Benchmark harness + baseline                                               | review |
| TQR-004 | Restaurant sign-up, staff sign-in/out, sessions, throttling                | done   |
| TQR-005 | Staff accounts and role guard                                              | done   |
| TQR-006 | Menu: stations, categories, items, availability                            | done   |
| TQR-007 | Tables, QR tokens, printable QR sheet, rotation                            | done   |
| TQR-008 | House rules and bank account settings                                      | done   |
| TQR-009 | ~ Platform admin suspend / reactivate                                      | done   |
| TQR-010 | Realtime hub: SSE + pg_notify + resync (spike first)                       | done   |
| TQR-011 | Guest check-in / join table session                                        | done   |
| TQR-012 | Guest menu and ordering (idempotent, price check)                          | done   |
| TQR-013 | Anomaly check, held orders, waiter confirm/reject                          | done   |
| TQR-014 | Kitchen station queue (FIFO, skip reason, late highlight)                  | done   |
| TQR-015 | Waiter ready list and serve                                                | done   |
| TQR-016 | Guest live dish status + realtime and rush-replay benchmarks               | done   |
| TQR-017 | Tenant isolation and role e2e matrix                                       | review |
| TQR-018 | Bill with VietQR payload                                                   | done   |
| TQR-019 | Cashier confirm, close session, pay-before-cooking                         | done   |
| TQR-020 | Guest table booking (exclusion constraint)                                 | done   |
| TQR-021 | Staff booking list: confirm, seat, cancel, late                            | done   |
| TQR-022 | Production security headers and X-Powered-By removal (before first deploy) | todo   |
| TQR-023 | Step-up auth (current password) for bank account changes                   | todo   |
| TQR-024 | Archive ("Ẩn bàn") tables with history                                     | todo   |
| TQR-025 | Re-sync the open bill when the kitchen cancels an item                     | review |
| TQR-026 | `make bench` setup tolerant of per-IP limits (dedicated bench IPs/limits)  | todo   |
