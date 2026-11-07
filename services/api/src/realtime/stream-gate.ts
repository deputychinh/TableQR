import { Inject, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppLogger } from '../common/logging/app-logger.js';
import { DomainError } from '../common/errors/domain.error.js';
import { tenantOf } from '../common/tenant.js';
import { SETTINGS, type Settings } from '../config/settings.js';
import { AuthService, type Principal } from '../identity/auth.service.js';
import { RealtimeHub } from './realtime.hub.js';
import { openStream } from './sse.js';

export const TOO_MANY_STREAMS = 'TOO_MANY_STREAMS';

export interface StaffStreamOptions<S> {
  topics: string[];
  snapshot: () => Promise<S>;
}

/**
 * The one way a staff SSE stream opens (TQR-010): tenant from the session, caps per person and
 * per restaurant (in memory, per process; 429 `TOO_MANY_STREAMS`), the session re-checked on every
 * heartbeat and closed on revocation (D4), snapshot failures logged without content.
 */
@Injectable()
export class StreamGate {
  private readonly perUser = new Map<string, number>();
  private readonly perRestaurant = new Map<string, number>();

  constructor(
    private readonly hub: RealtimeHub,
    private readonly auth: AuthService,
    private readonly logger: AppLogger,
    @Inject(SETTINGS) private readonly settings: Settings,
  ) {}

  async open<S>(
    principal: Principal,
    request: Request,
    response: Response,
    options: StaffStreamOptions<S>,
  ): Promise<void> {
    const restaurantId = tenantOf(principal);
    if (
      (this.perUser.get(principal.userId) ?? 0) >= this.settings.TQR_STREAMS_PER_USER ||
      (this.perRestaurant.get(restaurantId) ?? 0) >= this.settings.TQR_STREAMS_PER_RESTAURANT
    ) {
      throw new DomainError(TOO_MANY_STREAMS, 429, {
        detail: 'Đã mở quá nhiều màn hình trực tiếp. Hãy đóng bớt rồi thử lại.',
      });
    }
    increment(this.perUser, principal.userId);
    increment(this.perRestaurant, restaurantId);
    await openStream(this.hub, request, response, {
      restaurantId,
      topics: options.topics,
      snapshot: options.snapshot,
      heartbeatMs: this.settings.TQR_SSE_HEARTBEAT_MS,
      audience: {
        userId: principal.userId,
        isStillAllowed: () => this.auth.isSessionActive(principal.tokenHash),
      },
      onClose: () => {
        decrement(this.perUser, principal.userId);
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

const increment = (counts: Map<string, number>, key: string): void => {
  counts.set(key, (counts.get(key) ?? 0) + 1);
};

const decrement = (counts: Map<string, number>, key: string): void => {
  const next = (counts.get(key) ?? 0) - 1;
  if (next > 0) counts.set(key, next);
  else counts.delete(key);
};
