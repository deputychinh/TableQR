import { z } from 'zod';

const MIN_SECRET_LENGTH = 32;

const settingsSchema = z.object({
  TQR_DATABASE_URL: z.string().url(),
  TQR_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  TQR_SESSION_SECRET: z.string().min(MIN_SECRET_LENGTH),
  TQR_WEB_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://127.0.0.1:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
  PORT: z.coerce.number().int().positive().default(3000),
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
