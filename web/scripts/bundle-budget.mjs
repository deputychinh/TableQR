// Fails when the JavaScript a guest downloads before first render exceeds the budget (benchmarks/plan.md).
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const BUDGET_KB = Number(process.env.JS_BUDGET_KB ?? 150);
const dist = new URL('../dist/', import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(join(dist, '.vite/manifest.json'), 'utf8'));

const entryKey = Object.keys(manifest).find((key) => manifest[key].isEntry);
if (!entryKey) {
  console.error('bundle-budget: no entry chunk in dist/.vite/manifest.json — run vite build first');
  process.exit(2);
}

// Entry chunk plus everything it imports statically (dynamic imports load later, per route).
const initial = new Set();
const visit = (key) => {
  if (initial.has(key)) return;
  initial.add(key);
  for (const dep of manifest[key].imports ?? []) visit(dep);
};
visit(entryKey);

const gzipKb = [...initial]
  .map((key) => gzipSync(readFileSync(join(dist, manifest[key].file))).length / 1024)
  .reduce((sum, kb) => sum + kb, 0);

const line = `initial JS ${gzipKb.toFixed(1)} kB gzip (budget ${BUDGET_KB} kB, ${initial.size} chunk(s))`;
if (gzipKb > BUDGET_KB) {
  console.error(`bundle-budget: FAIL ${line}`);
  process.exit(1);
}
console.log(`bundle-budget: ok ${line}`);
