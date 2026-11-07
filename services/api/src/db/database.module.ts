import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { SETTINGS, type Settings } from '../config/settings.js';

export const PG_POOL = Symbol('PG_POOL');
export const DB = Symbol('DB');
export type Database = NodePgDatabase;

const POOL_MAX = 10;
const STATEMENT_TIMEOUT_MS = 5_000;

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [SETTINGS],
      useFactory: (settings: Settings): pg.Pool =>
        new pg.Pool({
          connectionString: settings.TQR_DATABASE_URL,
          max: POOL_MAX,
          statement_timeout: STATEMENT_TIMEOUT_MS,
        }),
    },
    {
      provide: DB,
      inject: [PG_POOL],
      useFactory: (pool: pg.Pool): Database => drizzle({ client: pool }),
    },
  ],
  exports: [PG_POOL, DB],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
