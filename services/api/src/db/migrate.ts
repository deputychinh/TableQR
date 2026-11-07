import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

/** Applies drizzle/*.sql to the given database (used by e2e setup; `make migrate` uses drizzle-kit). */
export const runMigrations = async (url: string): Promise<void> => {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: new URL('../../drizzle', import.meta.url).pathname,
    });
  } finally {
    await pool.end();
  }
};
