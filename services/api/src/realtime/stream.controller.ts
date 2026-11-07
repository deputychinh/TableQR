import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Principal } from '../identity/auth.service.js';
import { CurrentPrincipal, Roles, StaffGuard } from '../identity/guards.js';
import { ErrorCode } from '../common/enums/error-code.enum.js';
import { DomainError } from '../common/errors/domain.error.js';
import { RealtimeHub } from './realtime.hub.js';
import { openStream } from './sse.js';

/** Staff floor stream (waiter, cashier, owner). Later items enrich the snapshot (TQR-013…019). */
@Controller('stream')
@UseGuards(StaffGuard)
export class StreamController {
  constructor(private readonly hub: RealtimeHub) {}

  @Get('floor')
  @Roles('owner', 'cashier', 'waiter')
  async floor(
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    if (principal.tenantId === null) throw new DomainError(ErrorCode.Forbidden, 403);
    await openStream(this.hub, request, response, {
      restaurantId: principal.tenantId,
      topics: ['floor'],
      snapshot: () => Promise.resolve({ at: new Date().toISOString() }),
    });
  }
}
