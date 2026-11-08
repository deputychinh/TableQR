import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backoffSeconds, createSetupRetry } from './retry.mjs';

// TQR-026 (review round 1): the bench setup retry, unit-tested in node (`make test-scripts`).

/** A fake k6: `send` answers the given statuses in order; sleep and fail are recorded. */
const harness = (statuses, budgetS = 150) => {
  const slept = [];
  const retries = [];
  const sent = [];
  const answers = [...statuses];
  const retry = createSetupRetry({
    budgetS,
    sleep: (s) => slept.push(s),
    fail: (message) => {
      throw new Error(message);
    },
    onRetry: (s) => retries.push(s),
  });
  const send = () => {
    const status = answers.shift() ?? 201;
    sent.push(status);
    return { status };
  };
  return { retry, send, slept, retries, sent };
};

test('backoff doubles from 2 s and stays at 16 s', () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6].map((attempt) => backoffSeconds(attempt)),
    [2, 4, 8, 16, 16, 16, 16],
  );
});

test('a first answer that is not 429 is returned at once, without waiting or counting', () => {
  const h = harness([201]);
  assert.equal(h.retry.withRetry(h.send, 'sign-up').status, 201);
  assert.deepEqual(h.slept, []);
  assert.deepEqual(h.retries, []);
  assert.equal(h.retry.waitedS(), 0);
});

test('429s are retried with the backoff sequence until the call passes', () => {
  const h = harness([429, 429, 429, 429, 429, 201]);
  assert.equal(h.retry.withRetry(h.send, 'sign-up').status, 201);
  assert.deepEqual(h.slept, [2, 4, 8, 16, 16]);
  assert.equal(h.sent.length, 6);
});

test('the counter gets one entry per retry with its wait, and the total is reported', () => {
  const h = harness([429, 429, 201, 429, 201]);
  h.retry.withRetry(h.send, 'sign-up');
  // The backoff starts again for each call; the budget does not.
  h.retry.withRetry(h.send, 'check-in');
  assert.deepEqual(h.retries, [2, 4, 2]);
  assert.equal(h.retry.waitedS(), 8);
});

test('a non-429 error is not retried (the caller checks the status)', () => {
  const h = harness([500, 201]);
  assert.equal(h.retry.withRetry(h.send, 'table').status, 500);
  assert.deepEqual(h.slept, []);
});

test('the budget is shared by every call: once the next wait would exceed it, setup fails', () => {
  const h = harness(
    Array.from({ length: 50 }, () => 429),
    30,
  );
  // 2 + 4 + 8 + 16 = 30 s fits exactly; the next 16 s would not.
  assert.throws(
    () => h.retry.withRetry(h.send, 'check-in'),
    new Error('check-in: still 429 after waiting 30 s (SETUP_RETRY_BUDGET_S)'),
  );
  assert.deepEqual(h.slept, [2, 4, 8, 16]);
  assert.equal(h.retry.waitedS(), 30);
  // A later call has no budget left: the first 2 s wait is already too much.
  assert.throws(() => h.retry.withRetry(h.send, 'table'), /table: still 429 after waiting 30 s/);
  assert.deepEqual(h.slept, [2, 4, 8, 16]);
});

test('a fail that does not throw stops the loop and returns the 429', () => {
  const failed = [];
  const retry = createSetupRetry({ budgetS: 0, sleep: () => {}, fail: (m) => failed.push(m) });
  assert.equal(retry.withRetry(() => ({ status: 429 }), 'sign-up').status, 429);
  assert.deepEqual(failed, ['sign-up: still 429 after waiting 0 s (SETUP_RETRY_BUDGET_S)']);
});
