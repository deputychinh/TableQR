// Runs Lighthouse (mobile, simulated slow 4G) on the preview build and checks LCP (benchmarks/plan.md).
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

let report;
try {
  await waitForApp();
  execFileSync(
    'npx',
    [
      'lighthouse',
      URL_TO_TEST,
      '--quiet',
      '--only-categories=performance',
      '--form-factor=mobile',
      '--throttling-method=simulate',
      '--no-enable-error-reporting',
      '--output=json',
      `--output-path=${out}lighthouse.json`,
      '--chrome-flags=--headless=new',
    ],
    { stdio: 'inherit', env: { ...process.env, CHROME_PATH: chromium.executablePath() } },
  );
  report = JSON.parse(readFileSync(`${out}lighthouse.json`, 'utf8'));
} finally {
  preview.kill();
}

const lcp = report.audits['largest-contentful-paint'].numericValue;
const result = {
  // The landing page; the guest menu page measurement is TQR-016 (benchmarks/plan.md).
  workload: 'landing-cold-load',
  passed: lcp <= LCP_BUDGET_MS,
  lcp_ms: Math.round(lcp),
  performance_score: report.categories.performance.score,
};
writeFileSync(`${out}web.json`, JSON.stringify(result, null, 2));
const line = `LCP ${result.lcp_ms} ms (budget ${LCP_BUDGET_MS} ms), score ${result.performance_score}`;
if (!result.passed) fail(line);
console.log(`lighthouse: ok ${line}`);
