// Merges benchmarks/results/*.json into benchmarks/baseline.json with machine, date and commit.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';

const read = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined);
const results = ['api', 'web', 'bundle']
  .map((name) => read(`benchmarks/results/${name}.json`))
  .filter(Boolean);
if (results.length === 0) {
  console.error('record-baseline: no results — run `make bench` and `make lighthouse` first');
  process.exit(1);
}
const baseline = {
  recorded_at: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', '--short', 'HEAD']).toString().trim(),
  machine: `${os.cpus()[0]?.model ?? 'cpu'} × ${os.cpus().length}, ${Math.round(os.totalmem() / 2 ** 30)} GB, ${os.type()} ${os.release()}`,
  workloads: Object.fromEntries(results.map((r) => [r.workload, r])),
};
writeFileSync('benchmarks/baseline.json', `${JSON.stringify(baseline, null, 2)}\n`);
console.log(JSON.stringify(baseline, null, 2));
