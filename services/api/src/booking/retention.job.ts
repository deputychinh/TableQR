import {
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AppLogger } from '../common/logging/app-logger.js';
import { errorFields } from '../common/logging/error-fields.js';
import { BookingService } from './booking.service.js';

/** How often the retention purge runs; erasing up to an hour after day 30 still meets the rule. */
export const RETENTION_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Erases guest name, phone and note 30 days after the slot (docs/security.md). A plain interval in
 * the module rather than `@nestjs/schedule`: one idempotent UPDATE an hour needs no cron library,
 * and running it in every API process is harmless. Tests call `run()` directly.
 */
@Injectable()
export class RetentionJob implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly booking: BookingService,
    private readonly logger: AppLogger,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.run(), RETENTION_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  /** One purge; a failure is logged (never personal data) and retried on the next tick. */
  async run(): Promise<number> {
    try {
      const erased = await this.booking.purgeExpiredPersonalData();
      if (erased > 0) this.logger.info('booking_personal_data_erased', { count: erased });
      return erased;
    } catch (error: unknown) {
      this.logger.error('booking_retention_failed', { ...errorFields(error) });
      return 0;
    }
  }
}
