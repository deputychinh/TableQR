import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Principal } from '../identity/auth.service.js';
import { CurrentPrincipal, Roles, StaffGuard } from '../identity/guards.js';
import { StreamGate } from '../realtime/stream-gate.js';
import { COOKS, idParam, tenantOf } from './kitchen.http.js';
import { KitchenService } from './kitchen.service.js';

/** Kitchen station stream (ADR 0004): snapshot = the station queue, then `item.status` deltas. */
@Controller('stream')
@UseGuards(StaffGuard)
export class KitchenStreamController {
  constructor(
    private readonly streams: StreamGate,
    private readonly kitchen: KitchenService,
  ) {}

  @Get('station/:id')
  @Roles(...COOKS)
  async station(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const tenant = tenantOf(principal);
    const stationId = idParam(id);
    await this.kitchen.assertStation(tenant, stationId);
    await this.streams.open(principal, request, response, {
      topics: [`station:${stationId}`],
      snapshot: () => this.kitchen.queue(tenant, stationId),
    });
  }
}
