import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, gte, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../common/clock.js';
import { ErrorCode } from '../common/enums/error-code.enum.js';
import { DomainError } from '../common/errors/domain.error.js';
import { asTenantId, type TenantId } from '../common/tenant.js';
import { DB, type Database } from '../db/database.module.js';
import { authSessions, loginAttempts, restaurants, users } from '../db/schema.js';
import { checkCredentials } from './domain/credentials.js';
import { hashPasswordLimited } from './domain/password-slots.js';
import { hashToken, newSessionToken } from './domain/session-token.js';
import { slugify } from './domain/slug.js';
import { assertRestaurantActive } from './domain/restaurant-status.js';
import { EMAIL_UNIQUE_INDEX, IdentityErrorCode, emailTakenError } from './identity.errors.js';
import { UNIQUE_VIOLATION, isUniqueViolation, pgCode } from '../db/pg-error.js';
import { isLoginBlocked, windowStart } from './domain/throttle.js';

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
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
    const passwordHash = await hashPasswordLimited(input.password);
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
        if (isUniqueViolation(error, EMAIL_UNIQUE_INDEX)) throw emailTakenError();
        // slug clash: try again with a suffix
      }
    }
    throw new DomainError(ErrorCode.Conflict, 409);
  }

  /**
   * AC4/AC4a: throttled per email, one generic error for unknown email and wrong password.
   * D1: the attempt is reserved (counted as a failure) under a per-email advisory lock *before*
   * the password is checked, so parallel requests cannot run more than 10 checks in a window.
   * D2: unknown and disabled accounts cost one scrypt too (dummy hash).
   */
  async login(input: { email: string; password: string }): Promise<IssuedSession> {
    const email = input.email.trim().toLowerCase();
    const attemptId = await this.reserveAttempt(email);
    const [user] = await this.db
      .select({
        id: users.id,
        restaurantId: users.restaurantId,
        passwordHash: users.passwordHash,
        disabledAt: users.disabledAt,
        restaurantStatus: restaurants.status,
      })
      .from(users)
      .leftJoin(restaurants, eq(restaurants.id, users.restaurantId))
      .where(eq(users.email, email))
      .limit(1);
    const valid = await checkCredentials(user, input.password);
    if (!valid || user === undefined) {
      throw new DomainError(IdentityErrorCode.InvalidCredentials, 401, {
        detail: 'Email hoặc mật khẩu không đúng',
      });
    }
    await this.db
      .update(loginAttempts)
      .set({ succeeded: true })
      .where(eq(loginAttempts.id, attemptId));
    // AC54: only told after the right password, so it does not reveal which emails exist.
    if (user.restaurantId !== null && user.restaurantStatus !== null) {
      assertRestaurantActive({ status: user.restaurantStatus });
    }
    return this.issueSession(this.db, user.id, user.restaurantId);
  }

  /**
   * Step-up check before a sensitive change (TQR-023): the signed-in person re-enters their
   * password. Counted by the same per-email throttle as sign-in (AC4, D1), so it cannot be used to
   * guess the password either: 10 failures in 15 minutes → 429 `LOGIN_BLOCKED` here and at
   * sign-in. Wrong password → 403 `REAUTH_FAILED` (not 401: the session itself stays valid).
   */
  async reauthenticate(userId: string, password: string): Promise<void> {
    const [user] = await this.db
      .select({
        email: users.email,
        passwordHash: users.passwordHash,
        disabledAt: users.disabledAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) throw new DomainError(ErrorCode.Unauthorized, 401);
    const attemptId = await this.reserveAttempt(user.email);
    if (!(await checkCredentials(user, password))) {
      throw new DomainError(IdentityErrorCode.ReauthFailed, 403, {
        detail: 'Mật khẩu hiện tại không đúng',
      });
    }
    await this.db
      .update(loginAttempts)
      .set({ succeeded: true })
      .where(eq(loginAttempts.id, attemptId));
  }

  /** Counts failures and records this attempt as a failure in one short, per-email serialised step. */
  private async reserveAttempt(email: string): Promise<string> {
    const now = this.clock.now();
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`login:${email}`}))`);
      const [failures] = await tx
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
        throw new DomainError(IdentityErrorCode.LoginBlocked, 429, {
          detail: 'Thử lại sau 15 phút',
        });
      }
      const [attempt] = await tx
        .insert(loginAttempts)
        .values({ email, attemptedAt: now, succeeded: false })
        .returning({ id: loginAttempts.id });
      if (!attempt) throw new DomainError(ErrorCode.Internal, 500);
      return attempt.id;
    });
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

  /**
   * True while the session behind an open stream still grants access: present, not expired, the
   * person enabled and the restaurant active. Read-only: a stream does not extend the session.
   */
  async isSessionActive(tokenHash: string): Promise<boolean> {
    const [row] = await this.db
      .select({
        expiresAt: authSessions.expiresAt,
        disabledAt: users.disabledAt,
        status: restaurants.status,
      })
      .from(authSessions)
      .innerJoin(users, eq(users.id, authSessions.userId))
      .leftJoin(restaurants, eq(restaurants.id, users.restaurantId))
      .where(eq(authSessions.tokenHash, tokenHash))
      .limit(1);
    return (
      row !== undefined &&
      row.expiresAt > this.clock.now() &&
      row.disabledAt === null &&
      row.status !== 'suspended'
    );
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
