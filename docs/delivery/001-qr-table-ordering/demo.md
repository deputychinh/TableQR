# TableQR — demo (release 1)

**Khách quét mã QR ở bàn, gọi món, xem từng món đang nấu và chuyển khoản VietQR; bếp làm theo đúng thứ tự bàn vào trước.**

## What you can do now (local)

| You can…                                                                               | Evidence                                                                                            | ACs             |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------- |
| Sign up a restaurant, set its own house rules and bank account                         | `evidence/verify/01-owner-home-390.png`, `05-settings-390.png`                                      | AC1–AC4, AC12   |
| Build the menu (stations, "món chính", prices, sold out)                               | `evidence/verify/03-menu-390.png`, `02-price-65000.5-390.png`                                       | AC5–AC7         |
| Add tables and print one QR per table (A4, 6 per page)                                 | `evidence/verify/04-tables-390.png`, `evidence/tables-print-*.png`                                  | AC8–AC11        |
| Guest scans → party size → orders; unusual orders wait for the waiter                  | `evidence/verify/06-guest-menu-390.png`, `07-guest-orders-390.png`                                  | AC17–AC29       |
| Kitchen cooks oldest first; overtaking the same dish needs a reason; waiter serves     | `evidence/kitchen-1180-light.png`, `serving-390-light.png`; rush replay 0 unfair serves / 302 items | AC30–AC37       |
| Guest sees each dish live; pays by VietQR; the bill updates if the table orders more   | `evidence/verify/08-guest-bill-390.png`, `10-guest-bill-changed-390.png`, `12-guest-paid-390.png`   | AC38–AC43       |
| Cashier confirms against the bill code; pay-before restaurants cook only after payment | `evidence/verify/11-cashier-1180.png`, `17-…`, `19-paybefore-released-390.png`                      | AC13, AC44–AC47 |
| Guests book a table online; staff confirm and seat                                     | `evidence/booking-*.png`                                                                            | AC48–AC53       |
| Staff accounts per role; platform admin can suspend a restaurant                       | `evidence/r2-*.png`, `staff-*.png`                                                                  | AC14–AC16, AC54 |

Full per-AC evidence: [`evidence/verification.md`](evidence/verification.md).

## Run it

```sh
make install
make dev          # Postgres, migrations, API and web
open http://localhost:5310
```

Deployed: nowhere yet (local only). Code: https://github.com/deputychinh/TableQR

## Cut or deferred, and why

- Automatic bank reconciliation (PayOS/SePay) — owner chose staff confirmation for v1; the payment port is ready for an adapter.
- Archive a table with history ("Ẩn bàn", TQR-024), bill re-sync on kitchen cancel (TQR-025), bench limits (TQR-026) — found in review, small, after release 1.
- Production security headers (TQR-022) and step-up auth for bank changes (TQR-023) — required before the first real deployment.

## Hypothesis

"A strict FIFO queue with item states keeps serving order correct under rush load": measured by the rush-replay test (30 tables, 302 items, 1 161 random actions) — **0 items served ahead of an older same dish without a recorded reason**; status updates p95 5–11 ms (target ≤ 2 s). Real-restaurant validation needs a pilot.

## Delivery numbers

- 21 backlog items shipped (TQR-002…021), 85 commits, request → demo ≈ 12 hours of wall-clock agent work (2026-11-08 01:15 → 13:05).
- Final independent review: every item 9.0–9.5/10 (history in `status.md`); 3 improve rounds on the money path.
- Tests at release: API 345 unit + 623 e2e on real Postgres; web 365 unit + 42 Playwright journeys (iPhone + iPad, axe AA).
- Benchmarks: order submit p95 18 ms (≤ 300), guest menu LCP 1.96 s (≤ 2.5), initial JS 98 kB (≤ 150).

## Known issues

See `evidence/verification.md` → Known issues.

## Feedback

Results page: https://claude.ai/artifact/2AEstK4nesnjzNeaa4vi52 (private until shared). Owner feedback: recorded in `status.md` → Slices.
