// TQR-026: the bench setup's answer to a per-address limit (429), as a pure module so k6
// (`bench/api.js`) and node (`bench/lib/retry.test.mjs`, `make test-scripts`) run the same code.
// Everything with a side effect (sleep, fail, counters, logging) is passed in.

/** Seconds to wait before retry number `attempt` (0-based): 2, 4, 8, 16, 16… */
export const backoffSeconds = (attempt) => Math.min(2 ** (attempt + 1), 16);

/**
 * Builds `withRetry(send, what)`: sends, and while the answer is 429 waits with backoff and sends
 * again — until the next wait would exceed `budgetS` in total (over every call of this instance),
 * then `fail`s with `<what>: still 429 after waiting N s (SETUP_RETRY_BUDGET_S)`.
 * `onRetry(waitS)` counts each retry (the k6 counters); `waitedS()` reports the total so far.
 */
export const createSetupRetry = ({ budgetS, sleep, fail, onRetry = () => {}, warn = () => {} }) => {
  let waited = 0;
  const withRetry = (send, what) => {
    let res = send();
    for (let attempt = 0; res.status === 429; attempt += 1) {
      const wait = backoffSeconds(attempt);
      if (waited + wait > budgetS) {
        fail(`${what}: still 429 after waiting ${waited} s (SETUP_RETRY_BUDGET_S)`);
        // k6's `fail` throws; a `fail` that returns must not loop on.
        return res;
      }
      warn(`${what}: 429, retrying in ${wait} s`, res);
      onRetry(wait);
      waited += wait;
      sleep(wait);
      res = send();
    }
    return res;
  };
  return { withRetry, waitedS: () => waited };
};
