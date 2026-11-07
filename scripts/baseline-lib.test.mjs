import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_AGE_MS, selectResults } from './baseline-lib.mjs';

const now = 1_000_000_000;
const fresh = now - 1000;

test('accepts fresh results that passed their guard', () => {
  const { accepted, rejected } = selectResults(
    [{ name: 'api', result: { workload: 'a', passed: true }, mtimeMs: fresh }],
    now,
  );
  assert.equal(accepted.length, 1);
  assert.deepEqual(rejected, []);
});

test('rejects a failed run and a run with no passed flag', () => {
  const { accepted, rejected } = selectResults(
    [
      { name: 'api', result: { workload: 'a', passed: false, error_rate: 1 }, mtimeMs: fresh },
      { name: 'web', result: { workload: 'w' }, mtimeMs: fresh },
    ],
    now,
  );
  assert.equal(accepted.length, 0);
  assert.equal(rejected.length, 2);
});

test('rejects stale results and skips missing ones', () => {
  const { accepted, rejected } = selectResults(
    [
      { name: 'api', result: { passed: true }, mtimeMs: now - MAX_AGE_MS - 1 },
      { name: 'web', result: undefined, mtimeMs: 0 },
    ],
    now,
  );
  assert.equal(accepted.length, 0);
  assert.match(rejected[0], /older than 1 hour/);
});
