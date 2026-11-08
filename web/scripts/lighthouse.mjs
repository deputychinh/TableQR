// Runs Lighthouse (mobile, simulated slow 4G) on the preview build and checks LCP (benchmarks/plan.md):
// the landing page always, and with LH_GUEST_MENU=1 a seeded 40-item guest menu page (needs the API).
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const PORT = Number(process.env.LH_PORT ?? 4310);
const URL_TO_TEST = `http://127.0.0.1:${PORT}/`;
const APP_TITLE = 'TableQR';
const LCP_BUDGET_MS = Number(process.env.LCP_BUDGET_MS ?? 2500);
const out = new URL('../../benchmarks/results/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const fail = (message) => {
  console.error(`lighthouse: FAIL ${message}`);
  process.exit(1);
};

const answers = async () => {
  try {
    return await fetch(URL_TO_TEST);
  } catch {
    return undefined;
  }
};

// Refuse to measure whatever else is already listening on the port.
if (await answers()) {
  fail(`port ${PORT} is already in use — stop that server first`);
}

const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: ['ignore', 'ignore', 'pipe'],
});
let previewError = '';
preview.stderr.on('data', (chunk) => {
  previewError += chunk;
});
let previewExited = false;
preview.on('exit', () => {
  previewExited = true;
});

const waitForApp = async () => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (previewExited) fail(`preview exited: ${previewError.trim() || 'no output'}`);
    const response = await answers();
    if (response?.ok) {
      const html = await response.text();
      if (!html.includes(`<title>${APP_TITLE}</title>`))
        fail(`${URL_TO_TEST} is not the ${APP_TITLE} build`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  fail(`preview did not start on ${URL_TO_TEST}`);
};

/** One Lighthouse run (mobile, simulated slow 4G); `headers` are sent with every request. */
const measure = (url, name, headers) => {
  const args = [
    'lighthouse',
    url,
    '--quiet',
    '--only-categories=performance',
    '--form-factor=mobile',
    '--throttling-method=simulate',
    '--no-enable-error-reporting',
    '--output=json',
    `--output-path=${out}${name}.json`,
    '--chrome-flags=--headless=new',
  ];
  if (headers) args.push(`--extra-headers=${JSON.stringify(headers)}`);
  execFileSync('npx', args, {
    stdio: 'inherit',
    env: { ...process.env, CHROME_PATH: chromium.executablePath() },
  });
  return JSON.parse(readFileSync(`${out}${name}.json`, 'utf8'));
};

/**
 * TQR-016 `guest-menu-cold-load`: a restaurant with a 40-item menu (no photos) and one table,
 * created through the API behind the preview proxy (`TQR_API_PORT`), and a checked-in phone whose
 * `tqr_guest` cookie Lighthouse sends. The page is `/t/:qrToken` as a guest who scanned it.
 */
const seedGuestMenu = async () => {
  const api = `http://127.0.0.1:${process.env.TQR_API_PORT ?? '3310'}/api`;
  const origin = `http://127.0.0.1:${PORT}`;
  let staff = '';
  const call = async (method, path, body, cookie = staff) => {
    const headers = { 'content-type': 'application/json', origin, cookie };
    const response = await fetch(
      `${api}${path}`,
      body === undefined ? { method, headers } : { method, headers, body: JSON.stringify(body) },
    );
    if (!response.ok) fail(`seed ${method} ${path}: ${response.status} ${await response.text()}`);
    return response;
  };
  const stamp = `${Date.now()}`;
  const signUp = await call('POST', '/auth/signup', {
    restaurantName: `Lighthouse ${stamp}`,
    email: `lighthouse-${stamp}@example.com`,
    password: 'mat-khau-lighthouse-1',
  });
  staff = (signUp.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  const menu = await (await call('GET', '/menu')).json();
  const stationId = menu.stations[0].id;
  const category = async (name, isMain) =>
    (await (await call('POST', '/menu/categories', { name, isMain })).json()).id;
  const groups = [
    [await category('Món chính', true), 'Phở bò tái lăn', 20],
    [await category('Món phụ', false), 'Nem rán Hà Nội', 10],
    [await category('Đồ uống', false), 'Trà chanh giã tay', 10],
  ];
  for (const [categoryId, name, count] of groups) {
    for (let n = 1; n <= count; n += 1) {
      await call('POST', '/menu/items', {
        name: `${name} ${n}`,
        priceVnd: 30000 + n * 1000,
        categoryId,
        stationId,
        description: 'Nước dùng ninh xương 12 tiếng, bánh phở tươi, hành lá và rau thơm.',
      });
    }
  }
  const table = await (await call('POST', '/tables', { name: 'Bàn 1', seats: 4 })).json();
  const checkIn = await call('POST', '/g/session', { qrToken: table.qrToken, partySize: 2 }, '');
  const guest = (checkIn.headers.getSetCookie?.() ?? []).find((c) => c.startsWith('tqr_guest='));
  if (!guest) fail('check-in set no tqr_guest cookie');
  return { path: `/t/${table.qrToken}`, cookie: guest.split(';')[0] };
};

let report;
let guestReport;
try {
  await waitForApp();
  report = measure(URL_TO_TEST, 'lighthouse');
  if (process.env.LH_GUEST_MENU) {
    const guest = await seedGuestMenu();
    guestReport = measure(`http://127.0.0.1:${PORT}${guest.path}`, 'lighthouse-guest-menu', {
      Cookie: guest.cookie,
    });
  }
} finally {
  preview.kill();
}

const lcp = report.audits['largest-contentful-paint'].numericValue;
const result = {
  // The landing page; `LH_GUEST_MENU=1` also measures the guest menu (guest-menu-cold-load).
  workload: 'landing-cold-load',
  passed: lcp <= LCP_BUDGET_MS,
  lcp_ms: Math.round(lcp),
  performance_score: report.categories.performance.score,
};
writeFileSync(`${out}web.json`, JSON.stringify(result, null, 2));
const line = `LCP ${result.lcp_ms} ms (budget ${LCP_BUDGET_MS} ms), score ${result.performance_score}`;
console.log(`lighthouse: ${result.passed ? 'ok' : 'FAIL'} landing ${line}`);

if (guestReport) {
  const lcp = guestReport.audits['largest-contentful-paint'].numericValue;
  const guestResult = {
    workload: 'guest-menu-cold-load',
    passed: lcp <= LCP_BUDGET_MS,
    lcp_ms: Math.round(lcp),
    performance_score: guestReport.categories.performance.score,
    menu_items: 40,
  };
  writeFileSync(`${out}web-guest.json`, JSON.stringify(guestResult, null, 2));
  console.log(
    `lighthouse: guest menu LCP ${guestResult.lcp_ms} ms, score ${guestResult.performance_score}`,
  );
  if (!guestResult.passed) fail(`guest menu LCP ${guestResult.lcp_ms} ms over ${LCP_BUDGET_MS} ms`);
}

if (!result.passed) fail(`landing ${line}`);
