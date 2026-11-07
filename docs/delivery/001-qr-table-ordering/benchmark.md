# Product benchmark — QR table ordering (2026-11-08)

Sources read 2026-11-08 (vendor pages and help centres; not hands-on trials):
Toast Mobile Order & Pay — https://support.toasttab.com/en/article/Mobile-Order-and-Pay-Overview ,
https://intercom.help/toast-central/en/articles/14487000-toast-mobile-order-pay-group-ordering-overview ;
Sapo FnB QR Order — https://www.sapo.vn/blog/cach-thiet-lap-menu-dien-tu-qr-order-tren-sapo ;
iPOS menu điện tử O2O — https://ipos.vn/en/san-pham/menu-dien-tu-ipos-o2o/ ;
VietQR / EMVCo — https://viblo.asia/p/tao-ma-qrcode-chuyen-tien-ngan-hang-7ymJXnd5Vkq ,
https://nhandan.vn/chinh-thuc-ra-mat-vietqr-va-dich-vu-chuyen-tien-nhanh-bang-ma-qr-post650782.html

| Job step | Toast MO&P | Sapo QR Order | iPOS O2O | Our decision |
| --- | --- | --- | --- | --- |
| Table identity | one QR per table; changing the ordering URL breaks all QRs | one QR per table, auto-identifies table | — | copy: one QR per table, **stable URL with a random table token** (rotatable without reprinting the URL scheme) |
| Several guests, one table | group ordering onto one check (Tabs) | — | — | copy: a **table session** many phones join; one bill |
| Staff opens the table | server-started orders, guests join | call staff / request bill buttons | — | copy: staff can open/close sessions; guests can call staff / ask for bill |
| Kitchen | auto-fire to printers/KDS | to kitchen | routed per station (hot, cold, bar); states received → cooking → done | copy: KDS per station with item states; **different: strict FIFO by confirmed time + "late" highlight** |
| Party size vs order | not mentioned | not mentioned | not mentioned | **deliberately different**: party size at check-in, anomaly rule per restaurant → staff confirmation |
| Payment | card in app | request bill | e-wallet integrations (MoMo) | VietQR with amount + memo `<restaurant>-<bill id>`; staff confirms; pay-before or pay-after per restaurant |
| Multi-restaurant self-signup | sold via sales | sold via sales | sold via sales | **different**: self-signup, free, per-restaurant settings |
