# Benchmark plan

Updated: 2026-11-08 · Machine: Apple M4 Pro × 14, 48 GB, macOS (Darwin 27.0.0) · Command: `make bench` · Baseline: `benchmarks/baseline.json`

| Workload                                              | Data                                                               | Metric                                    | Percentile | Environment                             | Target (source)                | Baseline                                                          | Noise band | Guard                                                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------- | ---------- | --------------------------------------- | ------------------------------ | ----------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------- |
| Cook marks item done → guest + waiter screens updated | 30 tables × 3 phones, 1 kitchen, 2 waiters                         | end-to-end delay                          | p95        | local prod build, API limited to 1 vCPU | ≤ 2 s (spec AC31/AC38)         |                                                                   | ±15 %      | realtime script in CI                                                                               |
| Guest submits a 5-line cart                           | 30 tenants × 40 items, 30 concurrent tables                        | latency                                   | p95        | same                                    | ≤ 300 ms (spec)                |                                                                   | ±15 %      | k6 (`make bench`; until TQR-012 the workload is `GET /api/health`: p95 18.2 ms, 30 VUs, dev server) |
| Rush replay                                           | 30 tables, 302 items (seed 20261108), random cook + waiter actions | out-of-order finishes without skip record | all        | e2e on Testcontainers Postgres 17       | 0 (spec fairness)              | 0 (1 161 actions, 541 refused without reason, 286 recorded skips) | 0          | `services/api/test/rush-replay.e2e-spec.ts` in `make ci` (TQR-014)                                  |
| Guest menu cold load                                  | 40 items, no photos                                                | LCP / JS gzip                             | p75        | Lighthouse mobile, slow 4G              | ≤ 2.5 s / ≤ 150 kB (CWV, spec) |                                                                   | ±10 %      | `make lighthouse` (manual, ±10 % noise — 3 runs 1 650–1 869 ms) + bundle budget in `make ci`        |

## Baseline (2026-11-08, commit 3b22661)

| Workload                               | Number                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| api-health (stand-in for order submit) | p95 18.2 ms, p99 40.2 ms, 3 674 req/s, 0 errors (30 VUs against the watch-mode dev API) |
| Guest menu cold load (skeleton page)   | LCP 1 650–1 869 ms over 3 runs, performance score 1.0                                   |
| Initial JS                             | 52.6 kB gzip (budget 150 kB)                                                            |

Full numbers: `benchmarks/baseline.json`. Lighthouse stays out of `make ci` (20 s and noisy); the bundle budget is the CI guard (circuit breaker item 4).

## Changes to the baseline

- none yet
