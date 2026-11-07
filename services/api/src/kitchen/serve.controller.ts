import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { parseBody } from '../common/http/validate.js';
import type { Principal } from '../identity/auth.service.js';
import { CurrentPrincipal, Roles, StaffGuard } from '../identity/guards.js';
import { versionSchema } from './dto/kitchen.dto.js';
import type { ReadyBoard } from './domain/ready-board.js';
import { SERVERS, idParam, tenantOf } from './kitchen.http.js';
import { KitchenService, type ItemChange } from './kitchen.service.js';

/** The waiter's ready list and "Đã ra bàn" (S10, TQR-015). */
@Controller('serve')
@UseGuards(StaffGuard)
@Roles(...SERVERS)
export class ServeController {
  constructor(private readonly kitchen: KitchenService) {}

  @Get('ready')
  ready(@CurrentPrincipal() principal: Principal): Promise<ReadyBoard> {
    return this.kitchen.readyBoard(tenantOf(principal));
  }

  @Post('items/:id/serve')
  @HttpCode(200)
  serve(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ItemChange> {
    const { version } = parseBody(versionSchema, body);
    return this.kitchen.serve(tenantOf(principal), idParam(id), version, principal.userId);
  }
}
