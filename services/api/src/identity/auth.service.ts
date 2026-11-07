import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, gte } from 'drizzle-orm';
import { CLOCK, type Clock } from '../common/clock.js';
import { ErrorCode } from '../common/enums/error-code.enum.js';
import { DomainError } from '../common/errors/domain.error.js';
import { asTenantId, type TenantId } from '../common/tenant.js';
import { DB, type Database } from '../db/database.module.js';
import { authSessions, loginAttempts, restaurants, users } from '../db/schema.js';
import { hashPassword, verifyPassword } from './domain/password.js';
import { hashToken, newSessionToken } from './domain/session-token.js';
import { slugify } from './domain/slug.js';
import { isLoginBlocked, windowStart } from './domain/throttle.js';

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const UNIQUE_VIOLATION = '23505';
const SLUG_ATTEMPTS = 5;

export type StaffRole = 'owner' | 'cashier' | 'waiter' | 'kitchen' | 'platform_admin';

export interface Principal {
  userId: string;
  role: StaffRole;
  tenantId: TenantId | null;
  tokenHash: string;
}

export interface Me {
  user: { id: string; email: string; role: StaffRole; displayName: string };
  restaurant: { id: string; name: string; slug: string } | null;
}

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

const pgCode = (error: unknown): string | undefined => {
  let current: unknown = error;
  while (current instanceof Error) {
    const code: unknown = (current as Error & { code?: unknown }).code;
    if (typeof code === 'string') return code;
    current = current.cause;
  }
  return undefined;
};

const pgConstraint = (error: unknown): string | undefined => {
  let current: unknown = error;
  while (current instanceof Error) {
    const constraint: unknown = (current as Error & { constraint?: unknown }).constraint;
    if (typeof constraint === 'string') return constraint;
    current = current.cause;
  }
  return undefined;
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** AC1/AC2: restaurant + owner in one transaction; email uniqueness by the unique index. */
  async signUp(input: {
    restaurantName: string;
    email: string;
    password: string;
  }): Promise<IssuedSession> {
    const email = input.email.trim().toLowerCase();
    const passwordHash = await hashPassword(input.password);
    for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
      const base = slugify(input.restaurantName);
      const slug = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
      try {
        return await this.db.transaction(async (tx) => {
          const [restaurant] = await tx
            .insert(restaurants)
            .values({ name: input.restaurantName.trim(), slug })
            .returning({ id: restaurants.id });
          if (!restaurant) throw new DomainError(ErrorCode.Internal, 500);
          const [user] = await tx
            .insert(users)
            .values({ restaurantId: restaurant.id, email, passwordHash, role: 'owner' })
            .returning({ id: users.id });
          if (!user) throw new DomainError(ErrorCode.Internal, 500);
          return this.issueSession(tx, user.id, restaurant.id);
        });
      } catch (error: unknown) {
        if (pgCode(error) !== UNIQUE_VIOLATION) throw error;
        if (pgConstraint(error) === 'users_email_key') {
          throw new DomainError('EMAIL_TAKEN', 409, {
            detail: 'Email đã được dùng',
            extensions: { fields: [{ path: 'email', code: 'taken' }] },
          });
        }
        // slug clash: try again with a suffix
      }
    }
    throw new DomainError(ErrorCode.Conflict, 409);
  }

  /** AC4/AC4a: throttled per email, one generic error for unknown email and wrong password. */
  async login(input: { email: string; password: string }): Promise<IssuedSession> {
    const email = input.email.trim().toLowerCase();
    const now = this.clock.now();
    const [failures] = await this.db
      .select({ n: count() })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.email, email),
          eq(loginAttempts.succeeded, false),
          gte(loginAttempts.attemptedAt, windowStart(now)),
        ),
      );
    if (isLoginBlocked(failures?.n ?? 0)) {
      throw new DomainError('LOGIN_BLOCKED', 429, { detail: 'Thử lại sau 15 phút' });
    }
    const [user] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    const valid =
      user !== undefined &&
      user.disabledAt === null &&
      (await verifyPassword(input.password, user.passwordHash));
    await this.db.insert(loginAttempts).values({ email, attemptedAt: now, succeeded: valid });
    if (!valid || user === undefined) {
      throw new DomainError('INVALID_CREDENTIALS', 401, {
        detail: 'Email hoặc mật khẩu không đúng',
      });
    }
    return this.issueSession(this.db, user.id, user.restaurantId);
  }

  async logout(tokenHash: string): Promise<void> {
    await this.db.delete(authSessions).where(eq(authSessions.tokenHash, tokenHash));
  }

  /** Resolves a cookie token to a principal; expired or disabled → null. Slides the expiry. */
  async authenticate(token: string): Promise<Principal | null> {
    const tokenHash = hashToken(token);
    const now = this.clock.now();
    const [row] = await this.db
      .select({
        userId: users.id,
        role: users.role,
        restaurantId: users.restaurantId,
        disabledAt: users.disabledAt,
        expiresAt: authSessions.expiresAt,
        status: restaurants.status,
      })
      .from(authSessions)
      .innerJoin(users, eq(users.id, authSessions.userId))
      .leftJoin(restaurants, eq(restaurants.id, users.restaurantId))
      .where(eq(authSessions.tokenHash, tokenHash))
      .limit(1);
    if (!row || row.expiresAt <= now || row.disabledAt !== null || row.status === 'suspended') {
      return null;
    }
    await this.db
      .update(authSessions)
      .set({ expiresAt: new Date(now.getTime() + SESSION_TTL_MS) })
      .where(eq(authSessions.tokenHash, tokenHash));
    return {
      userId: row.userId,
      role: row.role,
      tenantId: row.restaurantId === null ? null : asTenantId(row.restaurantId),
      tokenHash,
    };
  }

  async me(principal: Principal): Promise<Me> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, principal.userId))
      .limit(1);
    if (!user) throw new DomainError(ErrorCode.Unauthorized, 401);
    const restaurant =
      principal.tenantId === null
        ? undefined
        : (
            await this.db
              .select({ id: restaurants.id, name: restaurants.name, slug: restaurants.slug })
              .from(restaurants)
              .where(eq(restaurants.id, principal.tenantId))
              .limit(1)
          )[0];
    return {
      user: { id: user.id, email: user.email, role: user.role, displayName: user.displayName },
      restaurant: restaurant ?? null,
    };
  }

  private async issueSession(
    executor: Pick<Database, 'insert'>,
    userId: string,
    restaurantId: string | null,
  ): Promise<IssuedSession> {
    const token = newSessionToken();
    const expiresAt = new Date(this.clock.now().getTime() + SESSION_TTL_MS);
    await executor
      .insert(authSessions)
      .values({ tokenHash: hashToken(token), userId, restaurantId, expiresAt });
    return { token, expiresAt };
  }
}
