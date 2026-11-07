# TableQR — project rules

Multi-tenant web app (iPad + phone first): QR codes on restaurant tables for ordering, kitchen queue, VietQR payment and table booking.

## Delivery profile

| Key | Value |
| --- | --- |
| reply language | Vietnamese |
| frontend default | Vue 3 |
| backend default | Node (TypeScript) |
| mobile | web only (responsive, iPad + phone first); no native apps |
| tenancy | multi-tenant: each restaurant self-registers, own data and own operating rules |
| payment | VietQR (EMVCo) per restaurant bank account, staff confirms receipt manually; PayOS/SePay adapter later |
| deploy target | local only (until the owner names one) |
