export const REDACTED = '[REDACTED]';

/**
 * Key patterns whose values never reach a log (OWASP Logging Cheat Sheet: credentials, tokens,
 * personal data). Matched case-insensitively anywhere in the key: `accessToken`, `x-table-token`,
 * `guest_phone` are all covered.
 */
const SENSITIVE_KEY =
  /token|secret|password|passwd|cookie|authorization|phone|guest_?name|email|params/i;

const redactValue = (value: unknown, seen: WeakSet<object>): unknown => {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, seen));
  }
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redactValue(inner, seen);
  }
  return out;
};

/** Returns a deep copy with sensitive keys replaced; never mutates its input. */
export const redact = <T>(value: T): T => redactValue(value, new WeakSet()) as T;
