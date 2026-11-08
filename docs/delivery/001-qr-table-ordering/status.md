# 001-qr-table-ordering — status

Request (verbatim): "Tôi muốn làm 1 website chạy chủ yếu trên ipad và mobile mục đích chính là cung cấp QR để dán lên các bàn ăn trong quán ăn xong r khách hàng có thể nhanh chóng đặt bàn và thanh toán luôn khi thanh toán thì sẽ là hình thức quét mã QR ở ngay bàn thông qua hình thức chuyển khoản hoặc có thể thanh toán sau khi ăn tuỳ nhưng nhìn chung là như vậy có timeline ra đồ ăn và quy trình rõ ràng để tránh trường hợp khách vào sau mà lại nhận món trước khách vào hay quy trình ví dụ bàn đi 5 người mà ra đồ ăn sai hay bàn đi 1 ngừoi mà lại order nhiều kiểu vậy hiểu ý tôi rồi chứ" + "mỗi nhà hàng nên có 1 tài khoản riêng" + "và quy cách vận hành riêng nhé"
Path: Full — because new product, several features (multi-tenant, ordering, kitchen queue, payment, booking)
Appetite: 6 days of agent work · started 2026-11-08 · **Spent: 4.5 of 6 days**
Status: doing

**Next action:** `demo` (results page artifact from evidence/verification.md), then `release` v0.5.0 local (tag, CHANGELOG section, smoke), retro + improve-skills.

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
| Set up    | done   | node-vue preset, `make ci` green, README quick start proven                             |
| Architect | done   | [design](design.md), ADRs 0002–0007, `docs/security.md`                                 |
| Plan      | done   | [plan](plan.md), backlog TQR-001…021 (+022–026 follow-ups)                              |
| Build     | done   | 21 items, merged on main; final review scores in "Review scores"                        |
| Verify    | done   | [evidence/verification.md](evidence/verification.md), make ci at 0088268                |
| Demo      | doing  |                                                                                         |
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
- 2026-11-08 TQR-003 benchmark harness + baseline — review 7.0 → fixes 985036e → batch review 9.0 PASS
- 2026-11-08 TQR-004 sign-up, sessions, owner screens — 744eac3 (pushed while make ci was red: only deletions; fixed by cfb84e8 minutes later), cfb84e8
- 2026-11-08 TQR-010 realtime hub — c93b2ae (spike: 300 streams, 30 000 deliveries, p95 21 ms)
- 2026-11-08 slice 1 via 4 parallel agents, merged: TQR-008 4632e0e, TQR-007 1ca6da3, TQR-006 63e1f5a, TQR-005+009 d47f25b — make ci green (API 201 unit + 276 e2e, web 229 unit + 22 Playwright)
- 2026-11-08 shared service schema 24b16cf; slices 2–4 started as 4 parallel agents: ordering (011/012/013/016), kitchen+serving (014/015), billing (018/019), booking (020/021)
- 2026-11-08 slice-1 batch review: PASS TQR-003 9.0, TQR-008 9.0; FAIL TQR-004 7.0 (security 0: parallel throttle bypass, timing oracle, malformed cookie 500), TQR-005 7.0, TQR-006 7.5, TQR-007 7.5, TQR-009 8.0, TQR-010 8.0 (streams survive revocation) — improve round 1 running in a fix agent
- 2026-11-08 slices 2–4 merged: billing TQR-018/019 (agent self-review 6.5 → fixed), booking TQR-020/021 62fbb0e (agent review 9/10), guest ordering TQR-011/012/013/016 17abfac, kitchen + serving TQR-014/015 b81f32f (agent review 9/10; rush replay 0 unfair serves over 302 items) — make ci green (API 321 unit + 486 e2e, web 325 unit + 34 Playwright)
- 2026-11-08 slice-1 fixes merged edc4ad9 (12 findings, each with a failing-first test) — make ci green (API 342 unit + 574 e2e, web 339 unit + 36 Playwright)
- 2026-11-08 release-1 batch review (fresh reviewer, real browser walkthrough): PASS 004, 005, 008, 009, 010, 011, 013, 014, 015, 019, 020, 021 (9.0–9.5); FAIL 006 8.5, 007 8.0 (deleting a table erases paid bills), 012 8.5, 016 8.5, 018 5.5 (no bill entry for guests, open bill not superseded live) — improve round 2 running as 2 agents (money/guest path, owner/staff UI + data)
- 2026-11-08 round 2 merged (b901958 UI/data, 8958771 guest/money), guest menu LCP 2 601 → 1 960 ms (3316e70), round 3 TQR-018 dead end fixed (f2ab976) — re-reviews: 006, 007, 012, 016 PASS 9.5; 018 PASS 9.0
- 2026-11-08 TQR-017 tenant isolation sweep — 28 id-bearing endpoints answer 404 to another restaurant's owner
- 2026-11-08 plan — 21 items in 5 slices, estimate 4.5–7 d (60 %), circuit breaker written
- 2026-11-08 architect — design.md, ADRs 0002–0007 (same-origin cookies, tenant scoping, SSE+NOTIFY, queue order, VietQR, booking exclusion), threat model

## Review scores (independent reviewers, final gate)

| Item    | Final | History                                                                                                    |
| ------- | ----- | ---------------------------------------------------------------------------------------------------------- |
| TQR-002 | 9.0   | 6.5 → 9.0                                                                                                  |
| TQR-003 | 9.0   | 7.0 → 9.0                                                                                                  |
| TQR-004 | 9.5   | 7.0 (security 0) → fixes → 9.5                                                                             |
| TQR-005 | 9.5   | 7.0 → 9.5                                                                                                  |
| TQR-006 | 9.5   | 7.5 → 8.5 → 9.5                                                                                            |
| TQR-007 | 9.5   | 7.5 → 8.0 (paid bills lost on delete) → 9.5                                                                |
| TQR-008 | 9.5   | 9.0 → 9.5                                                                                                  |
| TQR-009 | 9.5   | 8.0 → 9.5                                                                                                  |
| TQR-010 | 9.0   | 8.0 → 9.0                                                                                                  |
| TQR-011 | 9.0   | 9.0                                                                                                        |
| TQR-012 | 9.5   | 8.5 → 9.5                                                                                                  |
| TQR-013 | 9.5   | 9.5                                                                                                        |
| TQR-014 | 9.5   | 9.5                                                                                                        |
| TQR-015 | 9.5   | 9.5                                                                                                        |
| TQR-016 | 9.5   | 8.5 → 9.5                                                                                                  |
| TQR-017 | —     | built after the batch review (test-only sweep, 28 endpoints → 404); reviewed with the release verification |
| TQR-018 | 9.0   | 5.5 → 8.5 → 9.0 (round 3, last allowed)                                                                    |
| TQR-019 | 9.0   | 9.0                                                                                                        |
| TQR-020 | 9.0   | 9.0                                                                                                        |
| TQR-021 | 9.5   | 9.5                                                                                                        |

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

- Caught late (2026-11-08): a `;` before `git commit` let a commit go out after `make ci` failed (744eac3) — always chain `make ci && git commit`.

- Slowed us: …
- Caught late: …
- Change: …
