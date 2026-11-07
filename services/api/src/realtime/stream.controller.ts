import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Principal } from '../identity/auth.service.js';
import { CurrentPrincipal, Roles, StaffGuard } from '../identity/guards.js';
import { StreamGate } from './stream-gate.js';

/** Staff floor stream (waiter, cashier, owner). Later items enrich the snapshot (TQR-013…019). */
@Controller('stream')
@UseGuards(StaffGuard)
export class StreamController {
  constructor(private readonly streams: StreamGate) {}

  @Get('floor')
  @Roles('owner', 'cashier', 'waiter')
  async floor(
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    await this.streams.open(principal, request, response, {
      topics: ['floor'],
      snapshot: () => Promise.resolve({ at: new Date().toISOString() }),
    });
  }
}
