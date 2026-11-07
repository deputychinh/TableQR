# ADR 0006: VietQR payload built in-house, payment confirmed by staff

- Status: accepted · 2026-11-08

## Context

Guests pay by bank transfer by scanning a VietQR code with the exact amount (owner ruling). VietQR follows EMVCo merchant-presented QR with the NAPAS profile (Quyết định 1928/QĐ-NHNN); the payload holds the bank BIN, account number, amount and a memo (tag 62, sub-tag 08), ending with a CRC-16/CCITT-FALSE (tag 63). Automatic confirmation needs a paid provider (PayOS, SePay) that the owner did not choose for release 1.

## Decision

1. `billing/domain/vietqr.ts` builds the TLV string: `00=01`, `01=12` (dynamic, amount present), `38` = { `00=A000000727`, `01` = { `00`=BIN, `01`=account }, `02=QRIBFTTA` }, `53=704`, `54`=amount, `58=VN`, `62` = { `08`=memo }, `63`=CRC. The web app renders the string as a QR image locally (no third-party image API).
2. Memo = `TQR <bill code>` (5-char Crockford base32, unique per restaurant). Bills are superseded when items change, so a code always matches one amount (AC42).
3. A cashier or owner marks the bill paid (transfer or cash); the update is compare-and-set on `status='open'` (AC45). A `PaymentConfirmationPort` has one adapter today (manual); PayOS/SePay webhooks become a second adapter later.

## Consequences

- No network dependency for payment display; works on shop Wi-Fi outages for the guest's own banking app.
- Risk: a guest edits the amount in their banking app. Mitigated by the cashier checking amount + memo before confirming; recorded in `docs/security.md`.
- The payload is verified by a decoder in tests and by scanning with two real banking apps during the demo (manual check).
