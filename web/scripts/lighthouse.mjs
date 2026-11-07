// Runs Lighthouse (mobile, simulated slow 4G) on the preview build and checks LCP (benchmarks/plan.md).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const URL_TO_TEST = process.env.LH_URL ?? 'http://127.0.0.1:4310/';
const LCP_BUDGET_MS = Number(process.env.LCP_BUDGET_MS ?? 2500);
const out = new URL('../../benchmarks/results/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

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

const report = JSON.parse(readFileSync(`${out}lighthouse.json`, 'utf8'));
const lcp = report.audits['largest-contentful-paint'].numericValue;
const result = {
  workload: 'guest-menu-cold-load',
  lcp_ms: Math.round(lcp),
  performance_score: report.categories.performance.score,
};
writeFileSync(`${out}web.json`, JSON.stringify(result, null, 2));
console.log(
  `lighthouse: LCP ${result.lcp_ms} ms (budget ${LCP_BUDGET_MS} ms), score ${result.performance_score}`,
);
if (lcp > LCP_BUDGET_MS) {
  process.exit(1);
}
