# 001-qr-table-ordering — status

Request (verbatim): "Tôi muốn làm 1 website chạy chủ yếu trên ipad và mobile mục đích chính là cung cấp QR để dán lên các bàn ăn trong quán ăn xong r khách hàng có thể nhanh chóng đặt bàn và thanh toán luôn khi thanh toán thì sẽ là hình thức quét mã QR ở ngay bàn thông qua hình thức chuyển khoản hoặc có thể thanh toán sau khi ăn tuỳ nhưng nhìn chung là như vậy có timeline ra đồ ăn và quy trình rõ ràng để tránh trường hợp khách vào sau mà lại nhận món trước khách vào hay quy trình ví dụ bàn đi 5 người mà ra đồ ăn sai hay bàn đi 1 ngừoi mà lại order nhiều kiểu vậy hiểu ý tôi rồi chứ" + "mỗi nhà hàng nên có 1 tài khoản riêng" + "và quy cách vận hành riêng nhé"
Path: Full — because new product, several features (multi-tenant, ordering, kitchen queue, payment, booking)
Appetite: 6 days of agent work · started 2026-11-08 · **Spent: 0.6 of 6 days**
Status: doing

**Next action:** Build — run `deliver-loop` on TQR-003 (then TQR-004 …) per plan.md; slice 1 ends at v0.2.0.

Resume: re-invoke `ship`; "Where am I?" reads this file and does the Next action.

## Delivery profile used

- reply language: Vietnamese (~/.claude/CLAUDE.md)
- frontend / backend: Vue 3 / Node TypeScript (~/.claude/CLAUDE.md)
- mobile: web only (owner: "website chạy chủ yếu trên ipad và mobile")
- autonomy: decide-and-record (~/.claude/CLAUDE.md)
- push policy: push every green commit when a remote exists — no remote yet (~/.claude/CLAUDE.md)
- review gate: independent review ≥ 9/10, fit = 1, security ≥ 0.5, ≤ 3 rounds (~/.claude/CLAUDE.md)
- deploy target: local only (default)

## Stages

| Stage     | Status | Evidence / link                                                                         |
| --------- | ------ | --------------------------------------------------------------------------------------- |
| Discover  | done   | [brief](brief.md), [benchmark](benchmark.md)                                            |
| Specify   | done   | [spec](spec.md) (16 stories, 54 ACs), [benchmarks/plan.md](../../../benchmarks/plan.md) |
| Set up    | doing  |                                                                                         |
| Architect | todo   |                                                                                         |
| Plan      | todo   |                                                                                         |
| Build     | todo   |                                                                                         |
| Verify    | todo   |                                                                                         |
| Demo      | todo   |                                                                                         |
| Release   | todo   | local only                                                                              |
| Operate   | n.a.   | no deploy target yet                                                                    |
| Learn     | todo   |                                                                                         |

## Slices

| Slice      | Items | Verified | Demo | Notified | Feedback → re-plan | Release |
| ---------- | ----- | -------- | ---- | -------- | ------------------ | ------- |
| 1 Skeleton |       |          |      |          |                    | —       |

## Progress log (one line per item or slice)

- 2026-11-08 triage — repo created, owner answered triage questions
- 2026-11-08 discover — brief go (appetite 6 days), product benchmark A — ed71312
- 2026-11-08 spec — 16 stories, 54 ACs, 6 quality targets; booking kept in release 1 as last slice (cuttable)
- 2026-11-08 set up — node-vue preset (NestJS 12 + Drizzle + Postgres 17, Vite + Vue 3), make ci green, user path proven on localhost and 127.0.0.1
- 2026-11-08 TQR-002 same-origin /api, problem details, redacted logs — shipped 9.0/10 (round 1: 6.5) — 2251990, 107511c, 3b22661
- 2026-11-08 plan — 21 items in 5 slices, estimate 4.5–7 d (60 %), circuit breaker written
- 2026-11-08 architect — design.md, ADRs 0002–0007 (same-origin cookies, tenant scoping, SSE+NOTIFY, queue order, VietQR, booking exclusion), threat model

## Rulings (decisions taken without asking)

- 2026-11-08 Web only, responsive PWA (iPad + phone first) — owner said "website"; reversible by adding native apps on the same API.
- 2026-11-08 Multi-tenant, each restaurant self-registers; a platform-admin page can suspend a restaurant — owner answer.
- 2026-11-08 Per-restaurant operating settings (pay before / after eating, order approval, anomaly thresholds per party size) — owner: "quy cách vận hành riêng".
- 2026-11-08 Payment: VietQR generated from the restaurant's bank account, staff marks "Đã nhận"; PayOS/SePay behind an adapter later — owner answer; no paid account needed.
- 2026-11-08 Scope: order-at-table first, then online table booking — owner: "cả 1 và 2"; booking comes after ordering in the plan.
- 2026-11-08 Kitchen fairness: FIFO by order-confirmed time, every item bound to its table session — the core ask.
- 2026-11-08 Anomaly check: items vs party size beyond the restaurant's threshold → staff must confirm before the kitchen sees it — owner examples (1 person ordering a lot, 5 people getting the wrong food).
- 2026-11-08 Held orders keep queue position by request time; party size cap = seats + 4; guests need no login — fairness and speed at the table; reversible in spec.
- 2026-11-08 Kept the NestJS 12 generator defaults (oxlint type-aware instead of ESLint, Vitest without SWC) — generator output tracks the framework; reversible by adding ESLint.
- 2026-11-08 Ports 3310 (API), 5310 (web), 4310 (preview), 55432 (Postgres) — 3000/5173 are taken by another local project; Vite bound to 127.0.0.1, CORS allows localhost and 127.0.0.1.

## Questions for the owner (only what nobody else can answer)

- Hosting / domain for real restaurants — blocking Release only? no (local only until named).
- Do you charge restaurants (subscription)? — blocking? no; billing out of scope for v1.

## Cut scope and backlog findings

- Platform billing for restaurants — not asked for; backlog later.

## Retro

- Slowed us: …
- Caught late: …
- Change: …
