import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { parseBody } from '../common/http/validate.js';
import type { Principal } from '../identity/auth.service.js';
import { CurrentPrincipal, Roles, StaffGuard } from '../identity/guards.js';
import { doneSchema, versionSchema } from './dto/kitchen.dto.js';
import { COOKS, idParam, tenantOf } from './kitchen.http.js';
import {
  KitchenService,
  type ItemChange,
  type KitchenStation,
  type StationQueue,
} from './kitchen.service.js';

/** Station queues and cook actions (S9, TQR-014). */
@Controller('kitchen')
@UseGuards(StaffGuard)
@Roles(...COOKS)
export class KitchenController {
  constructor(private readonly kitchen: KitchenService) {}

  @Get('stations')
  async stations(
    @CurrentPrincipal() principal: Principal,
  ): Promise<{ stations: KitchenStation[] }> {
    return { stations: await this.kitchen.listStations(tenantOf(principal)) };
  }

  @Get('stations/:id/queue')
  queue(@CurrentPrincipal() principal: Principal, @Param('id') id: string): Promise<StationQueue> {
    return this.kitchen.queue(tenantOf(principal), idParam(id));
  }

  @Post('items/:id/start')
  @HttpCode(200)
  start(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ItemChange> {
    const { version } = parseBody(versionSchema, body);
    return this.kitchen.start(tenantOf(principal), idParam(id), version);
  }

  @Post('items/:id/done')
  @HttpCode(200)
  done(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ItemChange> {
    return this.kitchen.done(tenantOf(principal), idParam(id), parseBody(doneSchema, body));
  }
}
