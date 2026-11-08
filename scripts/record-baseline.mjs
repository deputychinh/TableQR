// Merges passing, fresh benchmarks/results/*.json into benchmarks/baseline.json (run from anywhere).
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { selectResults } from './baseline-lib.mjs';

const root = new URL('..', import.meta.url).pathname;
const resultsDir = `${root}benchmarks/results/`;
const entries = ['api', 'web', 'web-guest', 'bundle'].map((name) => {
  const path = `${resultsDir}${name}.json`;
  return existsSync(path)
    ? { name, result: JSON.parse(readFileSync(path, 'utf8')), mtimeMs: statSync(path).mtimeMs }
    : { name, result: undefined, mtimeMs: 0 };
});
const { accepted, rejected } = selectResults(entries, Date.now());
if (rejected.length > 0 || accepted.length === 0) {
  console.error(
    `record-baseline: refused — ${rejected.join('; ') || 'no results; run make bench, make budget, make lighthouse'}`,
  );
  process.exit(1);
}
const git = (...args) => execFileSync('git', args, { cwd: root }).toString().trim();
const baseline = {
  recorded_at: new Date().toISOString(),
  commit: git('rev-parse', '--short', 'HEAD'),
  dirty_tree: git('status', '--porcelain').length > 0,
  machine: `${os.cpus()[0]?.model ?? 'cpu'} × ${os.cpus().length}, ${Math.round(os.totalmem() / 2 ** 30)} GB, ${os.type()} ${os.release()}`,
  workloads: Object.fromEntries(accepted.map((r) => [r.workload, r])),
};
writeFileSync(`${root}benchmarks/baseline.json`, `${JSON.stringify(baseline, null, 2)}\n`);
console.log(JSON.stringify(baseline, null, 2));
