# TableQR — spec

Brief: `brief.md` · Status: ready · Updated: 2026-11-08

## Story map

| Activity → | Set up the restaurant                                                                       | Seat & order                                                      | Cook & serve                                                                 | Pay                                                  | Book ahead                                          |
| ---------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------- |
| Release 1  | S1 sign up · S2 menu & stations · S3 tables & QR sheet · S4 house rules · S5 staff accounts | S6 open session & party size · S7 guest orders · S8 anomaly check | S9 FIFO kitchen queue · S10 serve to the right table · S11 guest live status | S12 bill + VietQR · S13 cashier confirms / pay later | S14 guest books a table · S15 staff manage bookings |
| Later      | platform billing, menu photos upload to CDN                                                 | call-staff button, split bill                                     | printer tickets, prep-time estimates                                         | PayOS/SePay auto-confirm, card                       | deposits, SMS/Zalo reminders                        |

S16 (platform admin suspends a restaurant) sits under "Set up" in release 1.

## Stories and acceptance criteria

### S1 — As an owner, I want to register my restaurant myself, so that I can start without a sales call

- AC1: WHEN an owner submits restaurant name, email and a password of ≥ 10 characters THE SYSTEM SHALL create the restaurant, make that user its owner and sign them in.
- AC2 (negative): WHEN the email is already registered THE SYSTEM SHALL refuse with "Email đã được dùng" and create nothing.
- AC3 (isolation): WHILE signed in to restaurant A, WHEN a user requests any menu, table, order, bill or booking of restaurant B THE SYSTEM SHALL answer "not found" and reveal nothing.
- AC4 (negative): WHEN sign-in fails 10 times in 15 minutes for one email THE SYSTEM SHALL block further attempts for that email for 15 minutes.

### S2 — As an owner, I want to define menu categories, items, prices and kitchen stations, so that orders reach the right station

- AC5: WHEN the owner saves an item with name, price (whole VND, 1 000–100 000 000) and a station THE SYSTEM SHALL show it on the guest menu under its category.
- AC6: WHEN an item is marked "hết món" THE SYSTEM SHALL keep it visible but not orderable, and refuse an order containing it.
- AC7 (boundary): WHEN the price is 0, negative, fractional or above the limit THE SYSTEM SHALL refuse the save with a field error.

### S3 — As an owner, I want tables with a printable QR sheet, so that each table identifies itself

- AC8: WHEN the owner adds a table (name, seats 1–30) THE SYSTEM SHALL give it a QR code that opens that restaurant's page for that table.
- AC9: WHEN the owner prints the QR sheet THE SYSTEM SHALL produce one A4-printable page with each table's QR, table name and restaurant name.
- AC10 (security): WHEN the owner regenerates a table's QR THE SYSTEM SHALL make the old code show "Mã QR đã hết hạn".
- AC11 (negative): WHEN a scanned code is unknown THE SYSTEM SHALL show "Không tìm thấy bàn" and offer no ordering.

### S4 — As an owner, I want my own house rules, so that the system works the way my restaurant works

Rules (per restaurant, defaults in brackets): payment timing [pay after eating] | pay before cooking; QR transfer payment [off] | on (needs a bank account, TQR-029); session opening [guest self check-in] | staff opens; order approval [only anomalies] | every order | none; anomaly threshold — max main-dish portions per person [2] and min per person [0.5, rounded down]; booking enabled [yes], slot length [90 min].

- AC12: WHEN the owner changes a rule THE SYSTEM SHALL apply it to orders placed after the change and leave earlier orders unchanged.
- AC13: WHILE payment timing is "pay before cooking", WHEN a guest submits an order THE SYSTEM SHALL keep it out of the kitchen queue until its payment is confirmed.

### S5 — As an owner, I want staff accounts with roles, so that each person sees only their screen

Roles: owner, cashier, waiter, kitchen.

- AC14: WHEN the owner creates a staff account with a role THE SYSTEM SHALL let that person sign in and land on their role's screen.
- AC15 (negative): WHEN a kitchen user calls a cashier or owner action (confirm payment, change rules, add staff) THE SYSTEM SHALL refuse with "forbidden".
- AC16: WHEN the owner disables a staff account THE SYSTEM SHALL end that person's sessions within 1 minute.

### S6 — As a guest, I want to start my table by scanning and saying how many we are, so that the restaurant knows our party

- AC17: WHEN a guest scans a table with no open session WHILE the rule is "self check-in" THE SYSTEM SHALL ask for party size (1–table seats + 4) and open a session stamped with the arrival time.
- AC18: WHEN a second phone scans a table with an open session THE SYSTEM SHALL join it to the same session and cart history, without asking party size again.
- AC19 (negative): WHILE the rule is "staff opens", WHEN a guest scans a table with no open session THE SYSTEM SHALL show "Vui lòng chờ nhân viên mở bàn" and accept no order.
- AC20: WHEN staff changes the party size of an open session THE SYSTEM SHALL re-run the anomaly check on pending orders.
- AC21 (security): WHEN a session is closed (paid and cleared) THE SYSTEM SHALL refuse orders from phones that joined it.

### S7 — As a guest, I want to order from my phone, so that I don't wait for a waiter

- AC22: WHEN a guest submits a cart (1–50 lines, quantity 1–20 each, optional note ≤ 140 characters) THE SYSTEM SHALL record an order for that session with a server-side total and show it as "Đã gửi".
- AC23 (concurrency): WHEN two phones of one session submit at the same moment THE SYSTEM SHALL record two separate orders, each exactly once.
- AC24 (idempotency): WHEN the same submission is retried after a network drop THE SYSTEM SHALL not create a duplicate order.
- AC25 (negative): WHEN a cart contains an unavailable item or a price differs from the menu THE SYSTEM SHALL reject the order and show the current menu.

### S8 — As a waiter, I want suspicious orders held for my confirmation, so that a table of 1 doesn't order for 10 by mistake or prank

- AC26: WHEN an order would bring a session's main-dish portions above party size × max-per-person THE SYSTEM SHALL hold it as "Chờ xác nhận", show the guest why, and alert waiter screens.
- AC27: WHEN a session's main-dish portions are below party size × min-per-person at its first order THE SYSTEM SHALL flag it to the waiter as "Có thể thiếu món" without holding it.
- AC28: WHEN a waiter confirms a held order THE SYSTEM SHALL release it to the kitchen with its original confirmation-request time as queue position; WHEN the waiter rejects it THE SYSTEM SHALL cancel it and tell the guest.
- AC29: WHILE the rule is "every order", every order SHALL be held for confirmation.

### S9 — As a cook, I want one queue per station ordered by arrival, so that earlier tables are served first

- AC30: THE SYSTEM SHALL order each station's queue by the order's release time (submit time, or confirmation time per AC28), ties broken by table session arrival time.
- AC31: WHEN a cook marks an item "Đang nấu" then "Xong" THE SYSTEM SHALL update the guest and waiter screens within 2 s (p95).
- AC32 (fairness): WHEN a cook tries to mark an item "Xong" while an older item of the same menu item at that station is not done THE SYSTEM SHALL ask for confirmation and record the skip with a reason.
- AC33: WHEN an item has waited longer than its station's late threshold (default 15 min) THE SYSTEM SHALL highlight it as late.
- AC34: Each kitchen ticket SHALL show table name, party size, quantity, item, note and wait time.

### S10 — As a waiter, I want a ready list by table, so that the right dishes reach the right table

- AC35: WHEN an item is "Xong" THE SYSTEM SHALL list it on the waiter screen under its table, oldest first.
- AC36: WHEN the waiter marks it "Đã ra bàn" THE SYSTEM SHALL record who and when, and remove it from the list.
- AC37: WHEN all items of a session are served THE SYSTEM SHALL show the table as "Đủ món".

### S11 — As a guest, I want to see each dish's status, so that I know what is coming

- AC38: THE SYSTEM SHALL show each ordered item with status Chờ xác nhận / Đang chờ / Đang nấu / Xong / Đã ra bàn / Đã huỷ and update it without reload within 2 s (p95).
- AC39 (offline): WHEN the guest's connection drops and returns THE SYSTEM SHALL show current statuses within 5 s of reconnecting.

### S12 — As a guest, I want a bill with a VietQR code, so that I can pay by bank transfer from my table

- AC40: WHEN a guest or staff requests the bill THE SYSTEM SHALL show all non-cancelled items, total in VND and the bill code; WHERE the restaurant has turned QR payment on (house rule `payment.qrEnabled`, TQR-029) it SHALL also show a VietQR (EMVCo) code with the restaurant's bank account, the exact amount and a memo that identifies the bill (e.g. `TQR 7F3K2`).
- AC41: WHEN the restaurant has QR payment off (the default) or no bank account configured THE SYSTEM SHALL show the bill without a QR and "Thanh toán tại quầy", and SHALL NOT build a VietQR payload even if an account is stored.
- AC42 (boundary): WHEN items are added after a bill is shown THE SYSTEM SHALL issue a new bill code and amount; the old code SHALL show "Hoá đơn đã thay đổi".
- AC43: The generated VietQR payload SHALL decode with a correct CRC and the stated bank BIN, account, amount and memo.

### S13 — As a cashier, I want to confirm a transfer against a bill or take payment later, so that I know who paid

- AC44: WHEN the cashier marks a bill "Đã nhận" (transfer or cash) THE SYSTEM SHALL record method, amount, who and when, and show the guest "Đã thanh toán".
- AC45 (negative): WHEN the bill was already paid THE SYSTEM SHALL refuse a second confirmation.
- AC46: WHEN the cashier closes a paid session THE SYSTEM SHALL free the table for a new session.
- AC47 (negative): WHEN the cashier closes an unpaid session THE SYSTEM SHALL require a reason and record it.

### S14 — As a guest, I want to book a table online, so that I have a place when I arrive

- AC48: WHEN a guest submits date, time, party size (1–30), name and phone THE SYSTEM SHALL create a booking "Chờ duyệt" if a table with enough seats has no overlapping booking in that slot, else offer the nearest free times.
- AC49 (negative): WHEN the time is in the past, outside opening hours, or booking is disabled THE SYSTEM SHALL refuse with a reason.
- AC50 (concurrency): WHEN two guests book the last suitable table for the same slot at the same moment THE SYSTEM SHALL accept exactly one.

### S15 — As staff, I want to confirm, seat or cancel bookings, so that booked guests get their table

- AC51: WHEN staff confirms a booking THE SYSTEM SHALL assign a table and show it on that day's list.
- AC52: WHEN staff seats a booked party THE SYSTEM SHALL open a session at that table with the booked party size.
- AC53: WHEN a booking is 15 minutes past its time and not seated THE SYSTEM SHALL mark it "Trễ" for staff.

### S16 — As the platform admin, I want to suspend a restaurant, so that abuse can be stopped

- AC54: WHEN the admin suspends a restaurant THE SYSTEM SHALL refuse its guest pages ("Nhà hàng tạm ngưng") and staff sign-ins until reactivated.

## Quality targets

| Characteristic       | Workload                                               | Data                                                | Target                                                      | Percentile | Environment                                           | How it is checked               |
| -------------------- | ------------------------------------------------------ | --------------------------------------------------- | ----------------------------------------------------------- | ---------- | ----------------------------------------------------- | ------------------------------- |
| Status propagation   | cook marks item done → guest + waiter screen updated   | 30 open tables, 3 phones each, 1 kitchen, 2 waiters | ≤ 2 s                                                       | p95        | local production build, 1 vCPU API, simulated clients | `make bench` (realtime script)  |
| Order submit latency | guest submits a 5-line cart                            | 30 tenants × 40 items, 30 concurrent tables         | ≤ 300 ms                                                    | p95        | same                                                  | `make bench` (k6)               |
| Fairness             | rush replay: 30 tables, 300 items, random cook actions | seeded                                              | 0 items served out of release order without a recorded skip | all        | same                                                  | `make bench` + integration test |
| Guest page load      | cold load of menu page                                 | 40 items, no photos                                 | LCP ≤ 2.5 s, JS ≤ 150 kB gzip                               | p75        | Lighthouse mobile, slow 4G                            | Lighthouse CI                   |
| Accessibility        | guest, kitchen, cashier screens                        | —                                                   | WCAG 2.2 AA, targets ≥ 44 px                                | —          | iPad 10th gen and iPhone SE widths                    | axe in e2e + screenshot review  |
| Tenant isolation     | every staff/guest endpoint with another tenant's ids   | seeded 2 tenants                                    | 0 leaks                                                     | all        | CI                                                    | integration test matrix         |

## Non-goals and no-gos

- Non-goals: card or e-wallet payments, automatic bank reconciliation (later adapter), inventory, accounting/tax invoices, delivery, native apps, billing restaurants, multi-branch chains, multiple languages in UI (Vietnamese only).
- No-gos: no guest accounts or logins; no storing guest data beyond booking name and phone; no reading bank statements; no printer drivers in release 1.

## Glossary

| Term                | Meaning here                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| Restaurant (tenant) | one self-registered account with its own data and rules                                              |
| Table session       | one party's visit at a table: opened at arrival, closed after payment; phones join it                |
| Order               | one cart submission inside a session                                                                 |
| Release time        | when an order enters the kitchen queue: submit time, or the time it was held for confirmation (AC28) |
| Main dish           | an item whose category is marked "món chính" (counts for the anomaly rule)                           |
| Bill                | the payable snapshot of a session's items with a code used in the transfer memo                      |
| Station             | a kitchen area (bếp nóng, bếp lạnh, bar) with its own queue                                          |

## Open questions

- [RESOLVED by ruling] Whether held orders keep their queue position → yes, by request time (AC28), so confirmation delay doesn't punish the guest.
- [RESOLVED by ruling] Party size cap → table seats + 4 (extra chairs).

## Changes after build started

- 2026-11-08 (architect) Release time for pay-before-cooking orders = payment confirmation time — the kitchen cannot start earlier; ADR 0005.
- 2026-11-08 (owner) "các tính năng thanh toán thông qua qr code là option nhé" — QR payment becomes a per-restaurant option, off by default (TQR-029): house rule `payment.qrEnabled`; turning it on needs a bank account; off → every bill says "Thanh toán tại quầy" and the cashier gets one "Đã nhận tiền" action. Pay-before-cooking stays available (cash at the counter). AC40/AC41 reworded above; restaurants that had saved an account before the change keep QR on (migration `0009_qr_payment_option`).
