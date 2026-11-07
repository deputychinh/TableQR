import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { ErrorCode } from '../common/enums/error-code.enum.js';
import { DomainError } from '../common/errors/domain.error.js';
import { parseBody } from '../common/http/validate.js';
import type { TenantId } from '../common/tenant.js';
import type { Principal } from '../identity/auth.service.js';
import { CurrentPrincipal, Roles, StaffGuard } from '../identity/guards.js';
import { readCookie } from '../identity/session.cookie.js';
import { RealtimeHub } from '../realtime/realtime.hub.js';
import { openStream } from '../realtime/sse.js';
import {
  BillingService,
  type BillView,
  type CashierOverview,
  type SessionBillView,
} from './billing.service.js';
import { CLOSE_REASON_MAX, PAYMENT_METHODS } from './domain/cashier-rules.js';

/** Guest phone cookie (ADR 0002 §3); set by check-in/join (TQR-011). */
export const GUEST_COOKIE = 'tqr_guest';

const requestSchema = z.object({ sessionId: z.string().max(64) }).strict();
const paySchema = z.object({ method: z.enum(PAYMENT_METHODS) }).strict();
const closeSchema = z
  .object({ reason: z.string().trim().min(1).max(CLOSE_REASON_MAX).optional() })
  .strict();

const tenantOf = (principal: Principal): TenantId => {
  if (principal.tenantId === null) throw new DomainError(ErrorCode.Forbidden, 403);
  return principal.tenantId;
};

/** Staff side of billing (S12/S13): cashier screen, bill requests and payment confirmation. */
@Controller('bills')
@UseGuards(StaffGuard)
export class BillsController {
  constructor(private readonly billing: BillingService) {}

  @Get('overview')
  @Roles('owner', 'cashier')
  @Header('Cache-Control', 'no-store')
  overview(@CurrentPrincipal() principal: Principal): Promise<CashierOverview> {
    return this.billing.overview(tenantOf(principal));
  }

  /** Staff asks for a table's bill (AC40) — same rules as the guest request. */
  @Post()
  @HttpCode(200)
  @Roles('owner', 'cashier', 'waiter')
  request(
    @CurrentPrincipal() principal: Principal,
    @Body() body: unknown,
  ): Promise<SessionBillView> {
    const { sessionId } = parseBody(requestSchema, body);
    return this.billing.requestBill(tenantOf(principal), sessionId);
  }

  @Get(':id')
  @Roles('owner', 'cashier')
  @Header('Cache-Control', 'no-store')
  get(@CurrentPrincipal() principal: Principal, @Param('id') id: string): Promise<BillView> {
    return this.billing.getBill(tenantOf(principal), id);
  }

  /** AC44/AC45: only cashier and owner may confirm money (AC15, BFLA). */
  @Post(':id/pay')
  @HttpCode(200)
  @Roles('owner', 'cashier')
  pay(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<SessionBillView> {
    const { method } = parseBody(paySchema, body);
    return this.billing.pay(tenantOf(principal), principal.userId, id, method);
  }
}

/** Closing a table session (AC46/AC47). */
@Controller('sessions')
@UseGuards(StaffGuard)
export class SessionCloseController {
  constructor(private readonly billing: BillingService) {}

  @Get(':id/bill')
  @Roles('owner', 'cashier', 'waiter')
  @Header('Cache-Control', 'no-store')
  bill(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ): Promise<SessionBillView> {
    return this.billing.view(tenantOf(principal), id);
  }

  @Post(':id/close')
  @HttpCode(200)
  @Roles('owner', 'cashier')
  close(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<{ sessionId: string; status: 'closed'; closeReason: string | null }> {
    const { reason } = parseBody(closeSchema, body ?? {});
    return this.billing.closeSession(tenantOf(principal), principal.userId, id, reason);
  }
}

/** Guest bill (S12): the phone's `tqr_guest` cookie is the only key; tenant and session come from it. */
@Controller('g/bill')
export class GuestBillController {
  constructor(
    private readonly billing: BillingService,
    private readonly hub: RealtimeHub,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async view(@Req() request: Request): Promise<SessionBillView> {
    const guest = await this.billing.guestContext(readCookie(request, GUEST_COOKIE));
    return this.billing.view(guest.tenant, guest.sessionId);
  }

  /** "Thanh toán": issues (or reuses) the bill for what the table owes now. */
  @Post()
  @HttpCode(200)
  async request(@Req() request: Request): Promise<SessionBillView> {
    const guest = await this.billing.guestContext(readCookie(request, GUEST_COOKIE));
    return this.billing.requestBill(guest.tenant, guest.sessionId);
  }

  /** Live bill status for the guest's session ("Đã thanh toán" without a refresh, AC44). */
  @Get('stream')
  async stream(@Req() request: Request, @Res() response: Response): Promise<void> {
    const guest = await this.billing.guestContext(readCookie(request, GUEST_COOKIE));
    await openStream(this.hub, request, response, {
      restaurantId: guest.tenant,
      topics: [`session:${guest.sessionId}`],
      snapshot: () => this.billing.view(guest.tenant, guest.sessionId),
    });
  }
}
