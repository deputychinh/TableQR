import { Inject, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppLogger } from '../common/logging/app-logger.js';
import { DomainError } from '../common/errors/domain.error.js';
import { tenantOf, type TenantId } from '../common/tenant.js';
import { SETTINGS, type Settings } from '../config/settings.js';
import { AuthService, type Principal } from '../identity/auth.service.js';
import { RealtimeHub } from './realtime.hub.js';
import { openStream } from './sse.js';

export const TOO_MANY_STREAMS = 'TOO_MANY_STREAMS';

export interface GateStreamOptions<S> {
  topics: string[];
  snapshot: () => Promise<S>;
}

/** A guest phone's stream: the session it joined and how to re-check that it still may watch. */
export interface GuestAudience {
  tenant: TenantId;
  sessionId: string;
  /** Re-run on every heartbeat; false (device unlinked, restaurant suspended) ends the stream. */
  isStillAllowed: () => Promise<boolean>;
}

interface Audience {
  restaurantId: string;
  /** Counted per key against `perKeyLimit` (a staff member, or a guest table session). */
  key: string;
  perKeyLimit: number;
  /** Set for staff: revocations for this person close the stream. */
  userId: string | undefined;
  isStillAllowed: () => Promise<boolean>;
}

/**
 * The one way an SSE stream opens (TQR-010): caps per staff member / guest table session and per
 * restaurant (in memory, per process; 429 `TOO_MANY_STREAMS`), the audience re-checked on every
 * heartbeat and closed on revocation (D4: staff by person, everyone of a restaurant on
 * suspension), snapshot failures logged without content.
 */
@Injectable()
export class StreamGate {
  private readonly perKey = new Map<string, number>();
  private readonly perRestaurant = new Map<string, number>();

  constructor(
    private readonly hub: RealtimeHub,
    private readonly auth: AuthService,
    private readonly logger: AppLogger,
    @Inject(SETTINGS) private readonly settings: Settings,
  ) {}

  /** A staff stream: tenant from the session; ends when the person's access ends. */
  open<S>(
    principal: Principal,
    request: Request,
    response: Response,
    options: GateStreamOptions<S>,
  ): Promise<void> {
    return this.openFor(
      {
        restaurantId: tenantOf(principal),
        key: `user:${principal.userId}`,
        perKeyLimit: this.settings.TQR_STREAMS_PER_USER,
        userId: principal.userId,
        isStillAllowed: () => this.auth.isSessionActive(principal.tokenHash),
      },
      request,
      response,
      options,
    );
  }

  /** A guest stream (order statuses, bill): tenant and session from the guest cookie. */
  openGuest<S>(
    guest: GuestAudience,
    request: Request,
    response: Response,
    options: GateStreamOptions<S>,
  ): Promise<void> {
    return this.openFor(
      {
        restaurantId: guest.tenant,
        key: `session:${guest.sessionId}`,
        perKeyLimit: this.settings.TQR_STREAMS_PER_GUEST_SESSION,
        userId: undefined,
        isStillAllowed: guest.isStillAllowed,
      },
      request,
      response,
      options,
    );
  }

  private async openFor<S>(
    audience: Audience,
    request: Request,
    response: Response,
    options: GateStreamOptions<S>,
  ): Promise<void> {
    const { restaurantId, key } = audience;
    if (
      (this.perKey.get(key) ?? 0) >= audience.perKeyLimit ||
      (this.perRestaurant.get(restaurantId) ?? 0) >= this.settings.TQR_STREAMS_PER_RESTAURANT
    ) {
      throw new DomainError(TOO_MANY_STREAMS, 429, {
        detail: 'Đã mở quá nhiều màn hình trực tiếp. Hãy đóng bớt rồi thử lại.',
      });
    }
    increment(this.perKey, key);
    increment(this.perRestaurant, restaurantId);
    await openStream(this.hub, request, response, {
      restaurantId,
      topics: options.topics,
      snapshot: options.snapshot,
      heartbeatMs: this.settings.TQR_SSE_HEARTBEAT_MS,
      audience: { userId: audience.userId, isStillAllowed: audience.isStillAllowed },
      onClose: () => {
        decrement(this.perKey, key);
        decrement(this.perRestaurant, restaurantId);
      },
      onError: (what, error) => {
        this.logger.error(`realtime_${what}_failed`, {
          error: error instanceof Error ? error.name : typeof error,
          topics: options.topics.length,
        });
      },
    });
  }
}

/** For guest audiences: a refusal (DomainError) means "no longer allowed"; anything else throws. */
export const stillAllowed = (check: () => Promise<unknown>) => (): Promise<boolean> =>
  check().then(
    () => true,
    (error: unknown) => {
      if (error instanceof DomainError) return false;
      throw error;
    },
  );

const increment = (counts: Map<string, number>, key: string): void => {
  counts.set(key, (counts.get(key) ?? 0) + 1);
};

const decrement = (counts: Map<string, number>, key: string): void => {
  const next = (counts.get(key) ?? 0) - 1;
  if (next > 0) counts.set(key, next);
  else counts.delete(key);
};
