import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

let container: StartedPostgreSqlContainer | undefined;

/** One real Postgres for the whole e2e run; each spec gets its own app instance. */
export const setup = async (): Promise<void> => {
  container = await new PostgreSqlContainer('postgres:17').start();
  process.env.TQR_DATABASE_URL = container.getConnectionUri();
  process.env.TQR_SESSION_SECRET = 'e2e-secret-e2e-secret-e2e-secret-e2e';
};

export const teardown = async (): Promise<void> => {
  await container?.stop();
};
