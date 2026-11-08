# ADR 0008: QR payment is a per-restaurant option, off by default

- Status: accepted · 2026-11-08
- Supersedes: the "guests pay by VietQR transfer" assumption in the context of [ADR 0006](0006-vietqr-payload-and-manual-confirmation.md). How the VietQR payload is built and how staff confirm a payment (ADR 0006's decision) stay as they are.

## Context

ADR 0006 was written when the owner had ruled that guests pay by scanning a VietQR code with the exact amount. After release 0.5.0 the owner ruled that ordering and the kitchen come first and that QR transfer is something a restaurant may choose, not the way every restaurant takes money (TQR-029). Many small restaurants take cash at the counter and do not want a bank account number shown on every bill.

## Decision

1. A house rule `payment.qrEnabled` (boolean) per restaurant, **default `false`**. The owner turns it on at `/quan-ly/cai-dat` ("Cho khách chuyển khoản bằng mã QR"); turning it on without a saved bank account is refused (422, field `bank`).
2. With it off, the API never builds a VietQR payload (`transfer: null`) even when an account is stored; the guest bill shows items, total and code with "Thanh toán tại quầy"; the cashier has one "Đã nhận tiền" action (recorded as cash). Payments that staff record as transfers stay accepted.
3. Restaurants that had saved a bank account before the option existed keep QR on: migration `0009_qr_payment_option` sets `payment.qrEnabled = true` where `bank_bin` is set, without a new rules version (nothing changes for them).
4. Turning QR off keeps a saved account out of sight (removable with the password step of TQR-023), so turning it on again needs no re-entry.

## Consequences

- A new restaurant can take orders the day it signs up without any bank details.
- The VietQR code is shown only by restaurants that asked for it, which also shrinks the "guest edits the amount" risk of ADR 0006 to those restaurants.
- Every bill path checks the rule: the guest bill, the cashier screen, `GET /api/bills/overview` and `GET /api/restaurant/rules` expose `qrEnabled`, and the e2e journeys that pay by QR turn it on in their setup.
- The repo's own product line in `CLAUDE.md` ("payment: …") now reads QR as optional.
