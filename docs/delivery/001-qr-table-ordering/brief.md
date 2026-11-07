# TableQR — brief

Status: go · Appetite: 6 days of agent work · Date: 2026-11-08

## Press release (written as of ship day)

**Small Vietnamese restaurants get QR ordering at every table — and the kitchen serves tables in the order they arrived.**

At rush hour, guests wave for a menu, staff write orders by hand, the kitchen cooks whatever ticket is on top,
a table that sat down later gets its food first, a table of five gets one dish too few, and the owner checks
the bank app to see whether table 7 really paid. Off-the-shelf POS suites solve this but are sold through
sales teams and cost more than a small shop wants to pay.

With TableQR an owner signs up in minutes, types the menu, adds tables, sets the house rules (pay first or
after eating, when an order needs staff approval) and prints one QR per table. Guests scan, say how many
people, order from their phones, and watch each dish go from "đang chờ" to "đang nấu" to "đã ra". The kitchen
iPad shows one queue, oldest first. The bill shows a VietQR code with the exact amount and a memo, and the
cashier taps "Đã nhận" when the money arrives. Guests can also book a table ahead.

> "Bàn nào vào trước thì ra món trước, không còn cãi nhau với khách nữa." — quán bún 12 bàn (illustrative)

How to start: open the site, "Đăng ký nhà hàng", print the QR sheet.

## FAQ

**External (users)**

- Q: Do guests install an app? A: No — the phone camera opens a web page.
- Q: Several phones at one table? A: They join the same table session and share one bill.
- Q: How do I know a transfer arrived? A: The memo on the VietQR code names the bill; the cashier confirms it. Automatic confirmation (PayOS/SePay) comes later.
- Q: Can a guest order from home with a photo of the QR? A: Ordering needs an open session: staff opens it, or the restaurant's rule allows self check-in; an anomaly rule and staff confirmation catch the rest.

**Internal (cost, risk, scope)**

- Q: What will we not do? A: Card payments, automatic bank reconciliation, inventory, accounting, delivery apps, native apps, billing restaurants.
- Q: What is the riskiest part? A: Real-time kitchen and guest updates staying correct when several phones and iPads act at once on a weak shop Wi-Fi.

## Product benchmark

See [`benchmark.md`](benchmark.md). Decisions it drives:

- We copy one QR per table and a shared table session (Toast group ordering, Sapo).
- We copy station-routed kitchen display with item states (iPOS).
- We are deliberately different on fairness (strict FIFO + late highlight) and on party size vs order checks — none of the references advertise it.
- We are different on go-to-market: free self-signup with per-restaurant rules.

## Five customer questions

| Question | Answer | Fact or HYPOTHESIS |
| --- | --- | --- |
| Who is the customer? | Owners of small/medium Vietnamese restaurants (≈ 5–40 tables) and their staff; diners are the users | Fact (owner request); size range HYPOTHESIS |
| What problem? | Out-of-order serving, wrong dishes per table, orders that don't match the party, unclear payment status | Fact (owner request) |
| What benefit? | Fair, visible queue; fewer wrong dishes; quick payment by transfer | Fact (owner request) |
| How do we know? | The owner names these failures; Sapo/iPOS/Toast sell QR ordering, so demand exists | Fact (benchmark) |
| What is the experience? | Scan → party size → order → live status → VietQR or pay later; kitchen FIFO iPad; cashier confirms | Fact (owner answers) |

## Impact map

Goal: no table served out of arrival order and every payment confirmed against a bill, measured per day in the demo restaurant
→ Actor: kitchen, waiter, cashier, guest, owner
→ Behaviour change: kitchen cooks oldest-first; waiter delivers to the table on the ticket; cashier confirms by memo; guest orders without waiting; owner sets rules once
→ Deliverables: tenant signup + settings, menu/tables/QR sheet, guest ordering with party size, anomaly check, FIFO KDS by station, serve/runner view, bill + VietQR + confirm, table booking.

## Riskiest assumption

HYPOTHESIS: a strict FIFO queue with item states, fed by guest phones, keeps serving order correct under rush load;
measured by "items served out of confirmed order" = 0 and status update p95 < 1 s on 30 concurrent tables in a
load script; the demo shows it by replaying a rush with two tables arriving 1 minute apart.

| Risk | Assessment |
| --- | --- |
| Value | Medium — owners name the pain; competitors exist, so free + fairness rules must be the pull |
| Usability | Medium — staff on iPads in a hot kitchen: big targets, one screen per role, Vietnamese copy |
| Feasibility | Low–medium — real-time updates (SSE/WebSocket) and VietQR EMVCo payload are well known |
| Viability | Unknown — no hosting or pricing yet; local only until the owner names a target |
