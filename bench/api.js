// API workload for `make bench` (benchmarks/plan.md). The order-submit scenario joins in TQR-012.
import http from 'k6/http';
import { check, fail } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3310';
const P95_MS = 300;

export const options = {
  scenarios: {
    health: { executor: 'constant-vus', vus: 30, duration: '20s', exec: 'health' },
  },
  thresholds: {
    'http_req_duration{scenario:health}': [`p(95)<${P95_MS}`],
    http_req_failed: ['rate<0.01'],
  },
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
};

export const setup = () => {
  const res = http.get(`${BASE_URL}/api/health`, { timeout: '3s' });
  if (res.status !== 200) {
    fail(
      `API not reachable at ${BASE_URL}/api/health (status ${res.status}). Start it with: make dev`,
    );
  }
};

export const health = () => {
  const res = http.get(`${BASE_URL}/api/health`);
  check(res, { 'status is 200': (r) => r.status === 200 });
};

export const handleSummary = (data) => {
  const duration =
    data.metrics['http_req_duration{scenario:health}'] || data.metrics.http_req_duration;
  const result = {
    workload: 'api-health',
    vus: 30,
    p95_ms: Number(duration.values['p(95)'].toFixed(2)),
    p99_ms: Number(duration.values['p(99)'].toFixed(2)),
    rps: Number(data.metrics.http_reqs.values.rate.toFixed(1)),
    error_rate: data.metrics.http_req_failed.values.rate,
  };
  return {
    'benchmarks/results/api.json': JSON.stringify(result, null, 2),
    stdout: `\napi-health p95=${result.p95_ms} ms p99=${result.p99_ms} ms rps=${result.rps} errors=${result.error_rate}\n`,
  };
};
