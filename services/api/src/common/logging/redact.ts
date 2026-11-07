export const REDACTED = '[REDACTED]';

/** Keys whose values never reach a log (OWASP Logging Cheat Sheet: tokens, credentials, personal data). */
const SENSITIVE_KEYS = new Set([
  'cookie',
  'set-cookie',
  'authorization',
  'password',
  'token',
  'qrtoken',
  'phone',
  'guestname',
  'guestphone',
  'email',
  'secret',
]);

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
    out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? REDACTED : redactValue(inner, seen);
  }
  return out;
};

/** Returns a deep copy with sensitive keys replaced; never mutates its input. */
export const redact = <T>(value: T): T => redactValue(value, new WeakSet()) as T;
