// Creates the platform admin account (spec S16). There is no sign-up screen for this role.
//
//   TQR_ADMIN_PASSWORD='…' npm run admin:create -- --email admin@example.com
//
// The email comes from --email or TQR_ADMIN_EMAIL, the password from TQR_ADMIN_PASSWORD
// (preferred: arguments are visible in the process list) or --password. Neither is ever printed.
// Runs with Node's built-in TypeScript support, so it imports only files that have no relative
// imports themselves (password.ts, pg-error.ts) and writes the row with plain SQL.
import { parseArgs } from 'node:util';
import pg from 'pg';
import { z } from 'zod';
import { isUniqueViolation } from '../src/db/pg-error.ts';
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  hashPassword,
} from '../src/identity/domain/password.ts';

const DEFAULT_DATABASE_URL = 'postgresql://tableqr:tableqr@127.0.0.1:55432/tableqr';

const inputSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
});

const fail = (message: string): never => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};

const main = async (): Promise<void> => {
  const { values } = parseArgs({
    options: { email: { type: 'string' }, password: { type: 'string' } },
    strict: true,
  });
  const parsed = inputSchema.safeParse({
    email: values.email ?? process.env.TQR_ADMIN_EMAIL,
    password: process.env.TQR_ADMIN_PASSWORD ?? values.password,
  });
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    fail(
      `Invalid input (${fields}): a valid --email and a password of at least ${String(MIN_PASSWORD_LENGTH)} characters are required.`,
    );
    return;
  }
  const pool = new pg.Pool({
    connectionString: process.env.TQR_DATABASE_URL ?? DEFAULT_DATABASE_URL,
    max: 1,
  });
  try {
    const result = await pool.query<{ id: string }>(
      `insert into users (restaurant_id, email, password_hash, role, display_name)
       values (null, $1, $2, 'platform_admin', 'Quản trị nền tảng') returning id`,
      [parsed.data.email, await hashPassword(parsed.data.password)],
    );
    process.stdout.write(`Platform admin created (id ${result.rows[0]?.id ?? '?'}).\n`);
  } catch (error: unknown) {
    if (isUniqueViolation(error, 'users_email_key')) fail('That email already has an account.');
    throw error;
  } finally {
    await pool.end();
  }
};

await main();
