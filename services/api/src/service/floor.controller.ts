import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { ErrorCode } from '../common/enums/error-code.enum.js';
import { DomainError } from '../common/errors/domain.error.js';
import { parseBody } from '../common/http/validate.js';
import type { TenantId } from '../common/tenant.js';
import type { Principal } from '../identity/auth.service.js';
import { CurrentPrincipal, Roles, StaffGuard } from '../identity/guards.js';
import { OrdersService, type OrderView, type ReviewOrder } from './orders.service.js';
import { SessionsService, type SessionView } from './sessions.service.js';

/** Floor staff: waiters, cashiers and the owner; the kitchen never opens tables or approves orders. */
const FLOOR = ['owner', 'cashier', 'waiter'] as const;

const partySize = z.number().int();
const openSchema = z.object({ tableId: z.string().max(64), partySize }).strict();
const partySizeSchema = z.object({ partySize }).strict();

const tenantOf = (principal: Principal): TenantId => {
  if (principal.tenantId === null) throw new DomainError(ErrorCode.Forbidden, 403);
  return principal.tenantId;
};

/** Staff open a table for a party and change its size (S6, AC20). */
@Controller('sessions')
@UseGuards(StaffGuard)
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post()
  @HttpCode(201)
  @Roles(...FLOOR)
  open(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<SessionView> {
    const input = parseBody(openSchema, body);
    return this.sessions.open(tenantOf(principal), input.tableId, input.partySize);
  }

  @Patch(':id')
  @Roles(...FLOOR)
  changePartySize(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<SessionView> {
    const input = parseBody(partySizeSchema, body);
    return this.sessions.changePartySize(tenantOf(principal), id, input.partySize);
  }
}

/** Waiter review of held and flagged orders (S8, AC26–AC28). */
@Controller('orders')
@UseGuards(StaffGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get('review')
  @Roles(...FLOOR)
  @Header('Cache-Control', 'no-store')
  async review(@CurrentPrincipal() principal: Principal): Promise<{ items: ReviewOrder[] }> {
    return { items: await this.orders.reviewList(tenantOf(principal)) };
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @Roles(...FLOOR)
  confirm(@CurrentPrincipal() principal: Principal, @Param('id') id: string): Promise<OrderView> {
    return this.orders.confirm(tenantOf(principal), id, principal.userId);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @Roles(...FLOOR)
  reject(@CurrentPrincipal() principal: Principal, @Param('id') id: string): Promise<OrderView> {
    return this.orders.reject(tenantOf(principal), id, principal.userId);
  }

  @Post(':id/flag-seen')
  @HttpCode(204)
  @Roles(...FLOOR)
  flagSeen(@CurrentPrincipal() principal: Principal, @Param('id') id: string): Promise<void> {
    return this.orders.markFlagSeen(tenantOf(principal), id);
  }
}
