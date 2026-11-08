import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Principal } from '../identity/auth.service.js';
import { CurrentPrincipal, Roles, StaffGuard } from '../identity/guards.js';
import { ErrorCode } from '../common/enums/error-code.enum.js';
import { DomainError } from '../common/errors/domain.error.js';
import { FloorSnapshotRegistry } from './floor-snapshot.js';
import { RealtimeHub } from './realtime.hub.js';
import { openStream } from './sse.js';

/**
 * Staff floor stream (waiter, cashier, owner). Its snapshot is `{ at, ...parts }`, each part
 * registered by the module that owns it (`ready`: TQR-015 serve board; TQR-013…019 add theirs).
 */
@Controller('stream')
@UseGuards(StaffGuard)
export class StreamController {
  constructor(
    private readonly hub: RealtimeHub,
    private readonly floorSnapshot: FloorSnapshotRegistry,
  ) {}

  @Get('floor')
  @Roles('owner', 'cashier', 'waiter')
  async floor(
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    if (principal.tenantId === null) throw new DomainError(ErrorCode.Forbidden, 403);
    const tenant = principal.tenantId;
    await openStream(this.hub, request, response, {
      restaurantId: tenant,
      topics: ['floor'],
      snapshot: () => this.floorSnapshot.build(tenant, new Date()),
    });
  }
}
