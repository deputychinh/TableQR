import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DB, type Database } from '../db/database.module.js';

export interface HealthStatus {
  status: 'ok';
  db: 'up';
}

@Controller('health')
export class HealthController {
  constructor(@Inject(DB) private readonly db: Database) {}

  @Get()
  async check(): Promise<HealthStatus> {
    try {
      await this.db.execute(sql`select 1`);
    } catch (error: unknown) {
      throw new ServiceUnavailableException({ code: 'DB_UNAVAILABLE' }, { cause: error });
    }
    return { status: 'ok', db: 'up' };
  }
}
