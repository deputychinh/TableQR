import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { TenantId } from '../common/tenant.js';
import { DB, type Database } from '../db/database.module.js';
import { restaurants } from '../db/schema.js';
import { assertRestaurantActive } from './domain/restaurant-status.js';

/** Reusable AC54 check for any context that resolved a tenant (guest pages, table tokens). */
@Injectable()
export class RestaurantStatusService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Throws 404 for an unknown restaurant and 403 `RESTAURANT_SUSPENDED` for a suspended one. */
  async assertActive(tenantId: TenantId): Promise<void> {
    const [restaurant] = await this.db
      .select({ status: restaurants.status })
      .from(restaurants)
      .where(eq(restaurants.id, tenantId))
      .limit(1);
    assertRestaurantActive(restaurant);
  }
}
