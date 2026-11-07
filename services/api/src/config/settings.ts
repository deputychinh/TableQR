import { z } from 'zod';

const MIN_SECRET_LENGTH = 32;

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
  TQR_STREAMS_PER_RESTAURANT: z.coerce.number().int().positive().default(300),
  /** SSE heartbeat; each beat also re-checks the stream's session (D4 backstop). */
  TQR_SSE_HEARTBEAT_MS: z.coerce.number().int().min(100).default(15_000),
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
