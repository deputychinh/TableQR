// Creates the platform admin account (spec S16). There is no sign-up screen for this role.
//
//   TQR_ADMIN_PASSWORD='…' npm run admin:create -- --email admin@example.com
//
// The email comes from --email or TQR_ADMIN_EMAIL, the password from TQR_ADMIN_PASSWORD
// (preferred: arguments are visible in the process list) or --password. Neither is ever printed.
// Runs with Node's built-in TypeScript support; it imports only files without relative imports.
import { parseArgs } from 'node:util';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { z } from 'zod';
import { users } from '../src/db/schema.ts';
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
    const [admin] = await drizzle({ client: pool })
      .insert(users)
      .values({
        restaurantId: null,
        email: parsed.data.email,
        passwordHash: await hashPassword(parsed.data.password),
        role: 'platform_admin',
        displayName: 'Quản trị nền tảng',
      })
      .returning({ id: users.id });
    process.stdout.write(`Platform admin created (id ${admin?.id ?? '?'}).\n`);
  } catch (error: unknown) {
    if (isUniqueViolation(error, 'users_email_key')) fail('That email already has an account.');
    throw error;
  } finally {
    await pool.end();
  }
};

await main();
