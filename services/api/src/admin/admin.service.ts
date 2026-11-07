import { Inject, Injectable } from '@nestjs/common';
import { count, desc, eq, sql } from 'drizzle-orm';
import { ErrorCode } from '../common/enums/error-code.enum.js';
import { DomainError } from '../common/errors/domain.error.js';
import { DB, type Database } from '../db/database.module.js';
import { authSessions, restaurants } from '../db/schema.js';
import type { RestaurantStatus } from '../identity/domain/restaurant-status.js';

export interface AdminRestaurant {
  id: string;
  name: string;
  slug: string;
  status: RestaurantStatus;
  ownerEmail: string | null;
  staffCount: number;
  createdAt: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

const columns = {
  id: restaurants.id,
  name: restaurants.name,
  slug: restaurants.slug,
  status: restaurants.status,
  createdAt: restaurants.createdAt,
  ownerEmail: sql<string | null>`(
    select u.email from users u
    where u.restaurant_id = "restaurants"."id" and u.role = 'owner'
    order by u.created_at limit 1)`,
  staffCount: sql<number>`(
    select count(*)::int from users u where u.restaurant_id = "restaurants"."id")`,
};

type Row = {
  id: string;
  name: string;
  slug: string;
  status: RestaurantStatus;
  createdAt: Date;
  ownerEmail: string | null;
  staffCount: number;
};

const toRestaurant = (row: Row): AdminRestaurant => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  status: row.status,
  ownerEmail: row.ownerEmail,
  staffCount: row.staffCount,
  createdAt: row.createdAt.toISOString(),
});

/** Platform admin (spec S16): sees every restaurant and can suspend or reactivate one. */
@Injectable()
export class AdminService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(limit: number, offset: number): Promise<Page<AdminRestaurant>> {
    const rows = await this.db
      .select(columns)
      .from(restaurants)
      .orderBy(desc(restaurants.createdAt), desc(restaurants.id))
      .limit(limit)
      .offset(offset);
    const [total] = await this.db.select({ n: count() }).from(restaurants);
    return { items: rows.map(toRestaurant), total: total?.n ?? 0, limit, offset };
  }

  /**
   * AC54: a suspended restaurant's staff are signed out at once (their sessions are deleted in
   * the same transaction) and cannot sign in again until it is reactivated. Idempotent.
   */
  async setStatus(id: string, status: RestaurantStatus): Promise<AdminRestaurant> {
    return this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(restaurants)
        .set({ status })
        .where(eq(restaurants.id, id))
        .returning({ id: restaurants.id });
      if (!updated) throw new DomainError(ErrorCode.NotFound, 404);
      if (status === 'suspended') {
        await tx.delete(authSessions).where(eq(authSessions.restaurantId, id));
      }
      const [row] = await tx.select(columns).from(restaurants).where(eq(restaurants.id, id));
      if (!row) throw new DomainError(ErrorCode.NotFound, 404);
      return toRestaurant(row);
    });
  }
}
