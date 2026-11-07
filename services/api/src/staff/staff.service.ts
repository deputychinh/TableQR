import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, isNull, ne } from 'drizzle-orm';
import { CLOCK, type Clock } from '../common/clock.js';
import { ErrorCode } from '../common/enums/error-code.enum.js';
import { DomainError } from '../common/errors/domain.error.js';
import type { TenantId } from '../common/tenant.js';
import { DB, type Database } from '../db/database.module.js';
import { isUniqueViolation } from '../db/pg-error.js';
import { authSessions, restaurants, users } from '../db/schema.js';
import { hashPasswordLimited } from '../identity/domain/password-slots.js';
import { EMAIL_UNIQUE_INDEX, emailTakenError } from '../identity/identity.errors.js';
import {
  MAX_STAFF_PER_RESTAURANT_LIST,
  RESTAURANT_ROLES,
  type RestaurantRole,
  type StaffChange,
  endsSessions,
  staffChangeRefusal,
} from './domain/staff-rules.js';

export interface StaffMember {
  id: string;
  displayName: string;
  email: string;
  role: RestaurantRole;
  active: boolean;
  createdAt: string;
}

export interface NewStaff {
  displayName: string;
  email: string;
  password: string;
  role: RestaurantRole;
}

type Executor = Pick<Database, 'select'>;

const columns = {
  id: users.id,
  displayName: users.displayName,
  email: users.email,
  role: users.role,
  disabledAt: users.disabledAt,
  createdAt: users.createdAt,
};

type Row = {
  id: string;
  displayName: string;
  email: string;
  role: RestaurantRole | 'platform_admin';
  disabledAt: Date | null;
  createdAt: Date;
};

const isRestaurantRole = (role: Row['role']): role is RestaurantRole =>
  (RESTAURANT_ROLES as readonly string[]).includes(role);

const roleOf = (row: Row): RestaurantRole => {
  // Queries exclude platform admins (they have no restaurant); this keeps the type honest.
  if (!isRestaurantRole(row.role)) throw new DomainError(ErrorCode.Internal, 500);
  return row.role;
};

const toMember = (row: Row): StaffMember => ({
  id: row.id,
  displayName: row.displayName,
  email: row.email,
  role: roleOf(row),
  active: row.disabledAt === null,
  createdAt: row.createdAt.toISOString(),
});

const notFound = (): DomainError => new DomainError(ErrorCode.NotFound, 404);

/** Staff accounts of one restaurant (spec S5). Every query is scoped by the caller's tenant. */
@Injectable()
export class StaffService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(tenant: TenantId): Promise<StaffMember[]> {
    const rows = await this.db
      .select(columns)
      .from(users)
      .where(and(eq(users.restaurantId, tenant), ne(users.role, 'platform_admin')))
      .orderBy(asc(users.createdAt), asc(users.id))
      .limit(MAX_STAFF_PER_RESTAURANT_LIST);
    return rows.map(toMember);
  }

  async get(tenant: TenantId, id: string): Promise<StaffMember> {
    return toMember(await this.find(this.db, tenant, id));
  }

  /** AC14: the person can sign in with this email and password right away. */
  async create(tenant: TenantId, input: NewStaff): Promise<StaffMember> {
    const passwordHash = await hashPasswordLimited(input.password);
    try {
      const [row] = await this.db
        .insert(users)
        .values({
          restaurantId: tenant,
          email: input.email.trim().toLowerCase(),
          displayName: input.displayName.trim(),
          passwordHash,
          role: input.role,
        })
        .returning(columns);
      if (!row) throw new DomainError(ErrorCode.Internal, 500);
      return toMember(row);
    } catch (error: unknown) {
      if (isUniqueViolation(error, EMAIL_UNIQUE_INDEX)) throw emailTakenError();
      throw error;
    }
  }

  /**
   * AC16: role, name, enable/disable and password reset in one transaction. The restaurant row is
   * locked so two owners demoting each other at once cannot leave the restaurant ownerless.
   * Disabling or a new password deletes the person's sessions in the same transaction.
   */
  async update(
    tenant: TenantId,
    actorId: string,
    id: string,
    change: StaffChange,
  ): Promise<StaffMember> {
    const passwordHash =
      change.password === undefined ? undefined : await hashPasswordLimited(change.password);
    return this.db.transaction(async (tx) => {
      await tx
        .select({ id: restaurants.id })
        .from(restaurants)
        .where(eq(restaurants.id, tenant))
        .for('update');
      // Re-checked under the lock: the actor may have been demoted or disabled a moment ago.
      const [actor] = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.id, actorId),
            eq(users.restaurantId, tenant),
            eq(users.role, 'owner'),
            isNull(users.disabledAt),
          ),
        );
      if (!actor) throw new DomainError(ErrorCode.Forbidden, 403);
      const target = await this.find(tx, tenant, id);
      const [owners] = await tx
        .select({ n: count() })
        .from(users)
        .where(
          and(eq(users.restaurantId, tenant), eq(users.role, 'owner'), isNull(users.disabledAt)),
        );
      const refusal = staffChangeRefusal(
        actorId,
        { id: target.id, role: roleOf(target), disabled: target.disabledAt !== null },
        change,
        owners?.n ?? 0,
      );
      if (refusal) throw new DomainError(refusal, 409);
      const disabledAt =
        change.disabled === undefined
          ? undefined
          : change.disabled
            ? (target.disabledAt ?? this.clock.now())
            : null;
      const [row] = await tx
        .update(users)
        .set({
          role: change.role,
          displayName: change.displayName?.trim(),
          disabledAt,
          passwordHash,
        })
        .where(and(eq(users.id, target.id), eq(users.restaurantId, tenant)))
        .returning(columns);
      if (!row) throw notFound();
      if (endsSessions(change)) {
        await tx.delete(authSessions).where(eq(authSessions.userId, target.id));
      }
      return toMember(row);
    });
  }

  private async find(executor: Executor, tenant: TenantId, id: string): Promise<Row> {
    const [row] = await executor
      .select(columns)
      .from(users)
      .where(
        and(eq(users.id, id), eq(users.restaurantId, tenant), ne(users.role, 'platform_admin')),
      )
      .limit(1);
    if (!row) throw notFound();
    return row;
  }
}
