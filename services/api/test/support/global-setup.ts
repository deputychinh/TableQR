import { runMigrations } from '../../src/db/migrate.js';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

let container: StartedPostgreSqlContainer | undefined;

/** One real Postgres for the whole e2e run; each spec gets its own app instance. */
export const setup = async (): Promise<void> => {
  container = await new PostgreSqlContainer('postgres:17').start();
  process.env.TQR_DATABASE_URL = container.getConnectionUri();
  process.env.TQR_SESSION_SECRET = 'e2e-secret-e2e-secret-e2e-secret-e2e';
  // Every spec signs up and in from 127.0.0.1; the rate-limit spec lowers this for its own app.
  process.env.TQR_AUTH_RATE_LIMIT_PER_MINUTE = '100000';
  // The realtime spike opens 300 streams with one owner; the caps spec lowers these for its app.
  process.env.TQR_STREAMS_PER_USER = '1000';
  // Guest and booking throttles: every spec calls from 127.0.0.1 with a few phones; the limit specs
  // lower these for their own app.
  process.env.TQR_GUEST_CHECKINS_PER_MINUTE = '100000';
  process.env.TQR_GUEST_ORDERS_PER_10_MINUTES = '100000';
  process.env.TQR_GUEST_BILL_REQUESTS_PER_MINUTE = '100000';
  process.env.TQR_BOOKINGS_PER_HOUR = '100000';
  await runMigrations(container.getConnectionUri());
};

export const teardown = async (): Promise<void> => {
  await container?.stop();
};
