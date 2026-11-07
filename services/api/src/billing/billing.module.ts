import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import {
  BillsController,
  GuestBillController,
  SessionCloseController,
} from './billing.controller.js';
import { BillingService } from './billing.service.js';

/** Billing (spec S12/S13, ADR 0006): bills, VietQR, payment confirmation, closing sessions. */
@Module({
  imports: [IdentityModule],
  controllers: [BillsController, SessionCloseController, GuestBillController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
