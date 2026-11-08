// API workload for `make bench` (benchmarks/plan.md): "guest submits a 5-line cart" (TQR-012).
// Setup builds a real restaurant through the API — owner, 40-item menu, 30 tables, one checked-in
// guest phone per table — then phones submit carts at a fixed arrival rate and k6 measures p95.
import http from 'k6/http';
import exec from 'k6/execution';
import { check, fail } from 'k6';

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

export const options = {
  // Setup makes ~120 calls; the 30 check-ins stay within the 30 / min per-address limit.
  setupTimeout: '120s',
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
  return must(http.post(`${BASE_URL}${path}`, payload, { headers }), status, what);
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
    const res = http.post(`${BASE_URL}/api/g/session`, body, {
      headers,
      jar: new http.CookieJar(),
    });
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
  };
  const verdict = result.passed ? 'ok' : 'FAIL';
  return {
    'benchmarks/results/api.json': JSON.stringify(result, null, 2),
    stdout: `\n${WORKLOAD}: ${verdict} p95=${result.p95_ms} ms p99=${result.p99_ms} ms orders=${result.orders} errors=${result.error_rate}\n`,
  };
};
