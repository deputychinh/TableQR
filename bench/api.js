// API workload for `make bench` (benchmarks/plan.md): "guest submits a 5-line cart" (TQR-012).
// Setup builds a real restaurant through the API — owner, 40-item menu, 30 tables, one checked-in
// guest phone per table — then phones submit carts at a fixed arrival rate and k6 measures p95.
import http from 'k6/http';
import exec from 'k6/execution';
import { Counter } from 'k6/metrics';
import { check, fail, sleep } from 'k6';
import { createSetupRetry } from './lib/retry.mjs';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3310';
// Non-GET requests need an allowed Origin (docs/security.md, CSRF); the dev web origin is allowed.
const ORIGIN = __ENV.ORIGIN || 'http://localhost:5310';
const P95_MS = 300;
const TABLES = 30;
const MAINS = 10;
const DRINKS = 30;
const RATE_PER_S = 6;
const DURATION_S = Number(__ENV.DURATION_S || 60);
const WORKLOAD = 'guest-order-submit';
// TQR-026: setup shares the per-address limits (sign-up 20/min, check-in 30/min) with any other
// local traffic. A 429 in setup waits for the fixed window to pass and retries, instead of failing
// the run; production limits stay as they are. Backoff 2, 4, 8, 16, 16… s, at most this long.
const SETUP_RETRY_BUDGET_S = Number(__ENV.SETUP_RETRY_BUDGET_S || 150);
const setupRetries = new Counter('setup_429_retries');
const setupWaited = new Counter('setup_429_wait_s');
// The retry loop itself is pure and unit-tested (bench/lib/retry.test.mjs, `make test-scripts`).
const { withRetry } = createSetupRetry({
  budgetS: SETUP_RETRY_BUDGET_S,
  sleep,
  fail,
  onRetry: (waitS) => {
    setupRetries.add(1);
    setupWaited.add(waitS);
  },
  warn: (message, res) => console.warn(`${message} (${res.json('code')})`),
});

export const options = {
  // Setup makes ~120 calls; it may also wait out a per-address limit window (TQR-026).
  setupTimeout: `${60 + SETUP_RETRY_BUDGET_S}s`,
  scenarios: {
    order_submit: {
      executor: 'constant-arrival-rate',
      rate: RATE_PER_S,
      timeUnit: '1s',
      duration: `${DURATION_S}s`,
      preAllocatedVUs: TABLES,
      maxVUs: TABLES * 2,
      exec: 'submit',
    },
  },
  thresholds: {
    'http_req_duration{name:order_submit}': [`p(95)<${P95_MS}`],
    'http_req_failed{name:order_submit}': ['rate<0.01'],
  },
  summaryTrendStats: ['count', 'avg', 'med', 'p(95)', 'p(99)', 'max'],
};

/** A random UUID v4 (the API takes only UUIDs as Idempotency-Key, AC24). */
const uuid4 = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r % 4) + 8).toString(16);
  });

const json = (body) => ({
  headers: { 'content-type': 'application/json', origin: ORIGIN },
  body: JSON.stringify(body),
});

const must = (res, status, what) => {
  if (res.status !== status) fail(`${what}: expected ${status}, got ${res.status} ${res.body}`);
  return res.json();
};

const post = (path, body, status, what) => {
  const { headers, body: payload } = json(body);
  return must(
    withRetry(() => http.post(`${BASE_URL}${path}`, payload, { headers }), what),
    status,
    what,
  );
};

export const setup = () => {
  const health = http.get(`${BASE_URL}/api/health`, { timeout: '3s' });
  if (health.status !== 200) {
    fail(
      `API not reachable at ${BASE_URL}/api/health (status ${health.status}). Start it: make dev`,
    );
  }
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  // The setup VU's cookie jar keeps the owner's session for the staff calls below.
  post(
    '/api/auth/signup',
    {
      restaurantName: `Bench ${stamp}`,
      email: `bench-${stamp}@example.com`,
      password: 'mat-khau-bench-123',
    },
    201,
    'signup',
  );
  const menu = must(http.get(`${BASE_URL}/api/menu`), 200, 'menu');
  const stationId = menu.stations[0].id;
  const main = post('/api/menu/categories', { name: 'Món chính', isMain: true }, 201, 'category');
  const drinks = post('/api/menu/categories', { name: 'Đồ uống', isMain: false }, 201, 'category');
  const item = (name, priceVnd, categoryId) => ({
    menuItemId: post('/api/menu/items', { name, priceVnd, categoryId, stationId }, 201, 'item').id,
    priceVnd,
  });
  const mains = [];
  for (let i = 0; i < MAINS; i += 1)
    mains.push(item(`Món chính ${i + 1}`, 45000 + i * 1000, main.id));
  const drinkItems = [];
  for (let i = 0; i < DRINKS; i += 1)
    drinkItems.push(item(`Đồ uống ${i + 1}`, 10000 + i * 500, drinks.id));

  const phones = [];
  for (let i = 0; i < TABLES; i += 1) {
    const table = post('/api/tables', { name: `Bàn ${i + 1}`, seats: 8 }, 201, 'table');
    const { headers, body } = json({ qrToken: table.qrToken, partySize: 8 });
    // A fresh jar per check-in: each table gets its own phone (device cookie).
    const res = withRetry(
      () => http.post(`${BASE_URL}/api/g/session`, body, { headers, jar: new http.CookieJar() }),
      'check-in',
    );
    must(res, 201, 'check-in');
    const cookie = res.cookies.tqr_guest?.[0]?.value;
    if (!cookie) fail('check-in set no tqr_guest cookie');
    phones.push(cookie);
  }
  return { phones, mains, drinks: drinkItems };
};

/** One phone (round robin over the tables) submits 1 main + 4 drinks, each once. */
export const submit = (data) => {
  const n = exec.scenario.iterationInTest;
  const cookie = data.phones[n % data.phones.length];
  const pick = (list, k) => list[(n + k) % list.length];
  const lines = [pick(data.mains, 0), ...[0, 7, 14, 21].map((k) => pick(data.drinks, k))].map(
    (line) => ({ ...line, quantity: 1, note: null }),
  );
  const res = http.post(`${BASE_URL}/api/g/orders`, JSON.stringify({ lines }), {
    headers: {
      'content-type': 'application/json',
      origin: ORIGIN,
      cookie: `tqr_guest=${cookie}`,
      'idempotency-key': uuid4(),
    },
    jar: new http.CookieJar(),
    tags: { name: 'order_submit' },
  });
  check(res, { 'order recorded (201)': (r) => r.status === 201 });
};

const thresholdsPassed = (data) =>
  Object.values(data.metrics).every((metric) =>
    Object.values(metric.thresholds ?? {}).every((t) => t.ok),
  );

export const handleSummary = (data) => {
  const duration = data.metrics['http_req_duration{name:order_submit}'];
  const failed = data.metrics['http_req_failed{name:order_submit}'];
  // Setup failed (API down) or nothing ran: write no result, so it can never become a baseline.
  if (!duration || duration.values.count === 0) {
    return { stdout: `\n${WORKLOAD}: no result recorded (the run did not reach the workload)\n` };
  }
  const result = {
    workload: WORKLOAD,
    passed: thresholdsPassed(data),
    rate_per_s: RATE_PER_S,
    duration_s: DURATION_S,
    tables: TABLES,
    lines_per_cart: 5,
    orders: duration.values.count,
    p95_ms: Number(duration.values['p(95)'].toFixed(2)),
    p99_ms: Number(duration.values['p(99)'].toFixed(2)),
    max_ms: Number(duration.values.max.toFixed(2)),
    error_rate: failed?.values.rate ?? 0,
    // TQR-026: setup requests that met a per-address limit and were retried (not workload errors).
    setup_429_retries: data.metrics.setup_429_retries?.values.count ?? 0,
    setup_429_wait_s: data.metrics.setup_429_wait_s?.values.count ?? 0,
  };
  const verdict = result.passed ? 'ok' : 'FAIL';
  return {
    'benchmarks/results/api.json': JSON.stringify(result, null, 2),
    stdout: `\n${WORKLOAD}: ${verdict} p95=${result.p95_ms} ms p99=${result.p99_ms} ms orders=${result.orders} errors=${result.error_rate} setup 429 retries=${result.setup_429_retries} (waited ${result.setup_429_wait_s} s)\n`,
  };
};
