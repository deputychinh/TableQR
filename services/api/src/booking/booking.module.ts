import { Module } from '@nestjs/common';
import { RequestLimits } from '../common/http/request-limits.js';
import { IdentityModule } from '../identity/identity.module.js';
import { BookingController, GuestBookingController } from './booking.controller.js';
import { BookingService } from './booking.service.js';
import { RetentionJob } from './retention.job.js';

/** Table booking: the guest booking page (S14) and the staff booking list (S15). */
@Module({
  imports: [IdentityModule],
  controllers: [GuestBookingController, BookingController],
  providers: [BookingService, RetentionJob, RequestLimits],
  exports: [BookingService],
})
export class BookingModule {}
