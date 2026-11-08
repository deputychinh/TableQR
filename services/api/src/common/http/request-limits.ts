import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { CLOCK, type Clock } from '../clock.js';
import { ErrorCode } from '../enums/error-code.enum.js';
import { DomainError } from '../errors/domain.error.js';
import { SETTINGS, type Settings } from '../../config/settings.js';
import { FixedWindowLimiter } from './rate-limit.js';

const MINUTE_MS = 60_000;

/** Stable code for the per-phone order limit (docs/security.md, TQR-012). */
export const TOO_MANY_ORDERS = 'TOO_MANY_ORDERS';

/** The public (no login) write paths that are throttled, with their window and message. */
export type LimitName = 'guest_check_in' | 'guest_order' | 'guest_bill' | 'public_booking';

interface LimitSpec {
  limit: (settings: Settings) => number;
  windowMs: number;
  code: string;
  detail: string;
}

const SPECS: Readonly<Record<LimitName, LimitSpec>> = {
  guest_check_in: {
    limit: (s) => s.TQR_GUEST_CHECKINS_PER_MINUTE,
    windowMs: MINUTE_MS,
    code: ErrorCode.TooManyRequests,
    detail: 'Bạn quét mã quá nhiều lần. Hãy đợi một phút rồi thử lại.',
  },
  guest_order: {
    limit: (s) => s.TQR_GUEST_ORDERS_PER_10_MINUTES,
    windowMs: 10 * MINUTE_MS,
    code: TOO_MANY_ORDERS,
    detail: 'Bạn đã gửi rất nhiều đơn trong ít phút. Hãy đợi một lát hoặc gọi nhân viên.',
  },
  guest_bill: {
    limit: (s) => s.TQR_GUEST_BILL_REQUESTS_PER_MINUTE,
    windowMs: MINUTE_MS,
    code: ErrorCode.TooManyRequests,
    detail: 'Bạn vừa lấy hoá đơn nhiều lần. Hãy đợi một phút rồi thử lại.',
  },
  public_booking: {
    limit: (s) => s.TQR_BOOKINGS_PER_HOUR,
    windowMs: 60 * MINUTE_MS,
    code: ErrorCode.TooManyRequests,
    detail: 'Bạn đã gửi nhiều yêu cầu đặt bàn. Hãy gọi điện cho quán hoặc thử lại sau.',
  },
};

/**
 * Throttles for the guest and public write paths (docs/security.md, denial of service): per client
 * address for check-in and booking, per guest phone (its cookie) for orders and bill requests.
 * In memory and per process, like the sign-in limit (`FixedWindowLimiter`).
 */
@Injectable()
export class RequestLimits {
  private readonly limiters: Record<LimitName, FixedWindowLimiter>;

  constructor(
    @Inject(SETTINGS) settings: Settings,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    const entries = Object.entries(SPECS) as [LimitName, LimitSpec][];
    this.limiters = Object.fromEntries(
      entries.map(([name, spec]) => [
        name,
        new FixedWindowLimiter(spec.limit(settings), spec.windowMs),
      ]),
    ) as Record<LimitName, FixedWindowLimiter>;
  }

  /** Counts one request for `key`; 429 with the limit's code once the window is used up. */
  take(name: LimitName, key: string): void {
    if (this.limiters[name].hit(key, this.clock.now().getTime())) return;
    const spec = SPECS[name];
    throw new DomainError(spec.code, 429, { detail: spec.detail });
  }
}

/** The client address as Express sees it (behind a proxy: `trust proxy`, docs/security.md). */
export const clientAddress = (request: Request): string =>
  request.ip ?? request.socket.remoteAddress ?? 'unknown';
