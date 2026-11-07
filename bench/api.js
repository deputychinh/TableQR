// Placeholder workload until the benchmark harness item lands (benchmarks/plan.md).
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 5,
  duration: '10s',
  thresholds: { http_req_duration: ['p(95)<300'] },
};

export default function () {
  const res = http.get(`${__ENV.BASE_URL}/health`);
  check(res, { 'status is 200': (r) => r.status === 200 });
}
