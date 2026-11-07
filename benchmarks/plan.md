# Benchmark plan

Updated: 2026-11-08 · Machine: owner's Mac (to be filled at the first run) · Command: `make bench` · Baseline: `benchmarks/baseline.json`

| Workload | Data | Metric | Percentile | Environment | Target (source) | Baseline | Noise band | Guard |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Cook marks item done → guest + waiter screens updated | 30 tables × 3 phones, 1 kitchen, 2 waiters | end-to-end delay | p95 | local prod build, API limited to 1 vCPU | ≤ 2 s (spec AC31/AC38) | | ±15 % | realtime script in CI |
| Guest submits a 5-line cart | 30 tenants × 40 items, 30 concurrent tables | latency | p95 | same | ≤ 300 ms (spec) | | ±15 % | k6 |
| Rush replay | 30 tables, 300 items, random cook actions | out-of-order serves without skip record | all | same | 0 (spec fairness) | | 0 | integration test |
| Guest menu cold load | 40 items, no photos | LCP / JS gzip | p75 | Lighthouse mobile, slow 4G | ≤ 2.5 s / ≤ 150 kB (CWV, spec) | | ±10 % | Lighthouse CI + bundle budget |

## Changes to the baseline

- none yet
