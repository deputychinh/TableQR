import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Principal } from '../identity/auth.service.js';
import { CurrentPrincipal, Roles, StaffGuard } from '../identity/guards.js';
import { tenantOf } from '../common/tenant.js';
import { FloorSnapshotRegistry } from './floor-snapshot.js';
import { StreamGate } from './stream-gate.js';

/**
 * Staff floor stream (waiter, cashier, owner). Its snapshot is `{ at, ...parts }`, each part
 * registered by the module that owns it (`ready`: TQR-015 serve board; TQR-013…019 add theirs).
 */
@Controller('stream')
@UseGuards(StaffGuard)
export class StreamController {
  constructor(
    private readonly streams: StreamGate,
    private readonly floorSnapshot: FloorSnapshotRegistry,
  ) {}

  @Get('floor')
  @Roles('owner', 'cashier', 'waiter')
  async floor(
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const tenant = tenantOf(principal);
    await this.streams.open(principal, request, response, {
      topics: ['floor'],
      snapshot: () => this.floorSnapshot.build(tenant, new Date()),
    });
  }
}
