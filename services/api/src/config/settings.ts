import { isIP } from 'node:net';
import { z } from 'zod';

const MIN_SECRET_LENGTH = 32;

/** Express's named ranges (`trust proxy`), besides plain addresses and CIDR blocks. */
const PROXY_NAMES = new Set(['loopback', 'linklocal', 'uniquelocal']);
const CIDR_PATTERN = /^(.+)\/(\d{1,3})$/;

const isProxyEntry = (entry: string): boolean => {
  if (PROXY_NAMES.has(entry) || isIP(entry) !== 0) return true;
  const cidr = CIDR_PATTERN.exec(entry);
  if (!cidr?.[1] || !cidr[2]) return false;
  const version = isIP(cidr[1]);
  return version !== 0 && Number(cidr[2]) <= (version === 4 ? 32 : 128);
};

const settingsSchema = z.object({
  TQR_DATABASE_URL: z.string().url(),
  TQR_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  TQR_SESSION_SECRET: z.string().min(MIN_SECRET_LENGTH),
  TQR_WEB_ORIGINS: z
    .string()
    .default('http://localhost:5310,http://127.0.0.1:5310')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
  /** Sign-up + sign-in requests per client address per minute (in memory, per process). */
  TQR_AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),
  /** Open SSE streams per staff member and per restaurant, per process (429 above). */
  TQR_STREAMS_PER_USER: z.coerce.number().int().positive().default(10),
  /** Staff streams (kitchen, floor, cashier) of one restaurant; guests never count against it. */
  TQR_STREAMS_PER_RESTAURANT: z.coerce.number().int().positive().default(300),
  /** Guest phones of one table session share this (order status + bill streams per phone). */
  TQR_STREAMS_PER_GUEST_SESSION: z.coerce.number().int().positive().default(30),
  /** Guest streams of one restaurant, a separate pool so guests cannot lock out the staff. */
  TQR_GUEST_STREAMS_PER_RESTAURANT: z.coerce.number().int().positive().default(600),
  /** Guest check-ins (`POST /api/g/session`) per client address per minute. */
  TQR_GUEST_CHECKINS_PER_MINUTE: z.coerce.number().int().positive().default(30),
  /** Orders per guest phone per 10 minutes (`POST /api/g/orders`, 429 `TOO_MANY_ORDERS`). */
  TQR_GUEST_ORDERS_PER_10_MINUTES: z.coerce.number().int().positive().default(20),
  /** Bill requests per guest phone per minute (`POST /api/g/bill`). */
  TQR_GUEST_BILL_REQUESTS_PER_MINUTE: z.coerce.number().int().positive().default(6),
  /** Public booking requests per client address per hour (`POST /api/g/r/:slug/bookings`). */
  TQR_BOOKINGS_PER_HOUR: z.coerce.number().int().positive().default(10),
  /** SSE heartbeat; each beat also re-checks the stream's session (D4 backstop). */
  TQR_SSE_HEARTBEAT_MS: z.coerce.number().int().min(100).default(15_000),
  /**
   * Reverse proxies whose `X-Forwarded-For` is believed (Express `trust proxy`): comma-separated
   * addresses, CIDR blocks or `loopback` / `linklocal` / `uniquelocal`. Empty (default) = none, so
   * a client cannot choose its own rate-limit key by sending the header (TQR-022).
   */
  TQR_TRUSTED_PROXIES: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    )
    .pipe(z.array(z.string().refine(isProxyEntry))),
  /** `Strict-Transport-Security` on every API response; only with HTTPS in front (off locally). */
  TQR_HSTS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  PORT: z.coerce.number().int().positive().default(3310),
});

export type Settings = z.infer<typeof settingsSchema>;

/** Reads and validates settings once at boot; a bad value stops the process with a clear message. */
export const loadSettings = (env: NodeJS.ProcessEnv = process.env): Settings => {
  const parsed = settingsSchema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid settings: ${fields}`);
  }
  return parsed.data;
};

export const SETTINGS = Symbol('SETTINGS');
