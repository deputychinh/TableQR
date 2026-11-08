import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { uuidParam } from '../common/http/params.js';
import { parseBody } from '../common/http/validate.js';
import { tenantOf } from '../common/tenant.js';
import type { Principal } from '../identity/auth.service.js';
import { CurrentPrincipal, Roles, StaffGuard } from '../identity/guards.js';
import { isValidSeats, isValidTableName, normalizeTableName } from './domain/table-rules.js';
import {
  TablesService,
  type GuestTableView,
  type TableList,
  type TableView,
} from './tables.service.js';

// Limits live in domain/table-rules.ts; zod only wires them to the request body.
const name = z.string().max(200).transform(normalizeTableName).refine(isValidTableName);
const seats = z.number().refine(isValidSeats);

const createSchema = z.object({ name, seats }).strict();
const updateSchema = z
  .object({ name: name.optional(), seats: seats.optional() })
  .strict()
  .refine((patch) => patch.name !== undefined || patch.seats !== undefined, {
    message: 'empty_patch',
  });

/** Owner manages tables (AC8–AC10); floor staff may read them (e.g. to print a lost QR). */
@Controller('tables')
@UseGuards(StaffGuard)
export class TablesController {
  constructor(private readonly tables: TablesService) {}

  @Get()
  @Roles('owner', 'cashier', 'waiter')
  @Header('Cache-Control', 'no-store')
  list(@CurrentPrincipal() principal: Principal): Promise<TableList> {
    return this.tables.list(tenantOf(principal));
  }

  @Get(':id')
  @Roles('owner', 'cashier', 'waiter')
  @Header('Cache-Control', 'no-store')
  get(@CurrentPrincipal() principal: Principal, @Param('id') id: string): Promise<TableView> {
    return this.tables.get(tenantOf(principal), uuidParam(id));
  }

  @Post()
  @HttpCode(201)
  @Roles('owner')
  create(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<TableView> {
    return this.tables.create(tenantOf(principal), parseBody(createSchema, body));
  }

  @Patch(':id')
  @Roles('owner')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<TableView> {
    return this.tables.update(tenantOf(principal), uuidParam(id), parseBody(updateSchema, body));
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('owner')
  remove(@CurrentPrincipal() principal: Principal, @Param('id') id: string): Promise<void> {
    return this.tables.remove(tenantOf(principal), uuidParam(id));
  }

  /** TQR-024 "Ẩn bàn": hide a table that has history (it cannot be deleted). */
  @Post(':id/archive')
  @HttpCode(200)
  @Roles('owner')
  archive(@CurrentPrincipal() principal: Principal, @Param('id') id: string): Promise<TableView> {
    return this.tables.archive(tenantOf(principal), uuidParam(id));
  }

  /** TQR-024 "Hiện lại": bring a hidden table back. */
  @Post(':id/unarchive')
  @HttpCode(200)
  @Roles('owner')
  unarchive(@CurrentPrincipal() principal: Principal, @Param('id') id: string): Promise<TableView> {
    return this.tables.unarchive(tenantOf(principal), uuidParam(id));
  }

  @Post(':id/rotate-qr')
  @HttpCode(200)
  @Roles('owner')
  rotateQr(@CurrentPrincipal() principal: Principal, @Param('id') id: string): Promise<TableView> {
    return this.tables.rotateQr(tenantOf(principal), uuidParam(id));
  }
}

/** Public guest entry: what a scanned QR code resolves to (AC8, AC10, AC11). */
@Controller('g/t')
export class GuestTablesController {
  constructor(private readonly tables: TablesService) {}

  @Get(':qrToken')
  @Header('Cache-Control', 'no-store')
  resolve(@Param('qrToken') qrToken: string): Promise<GuestTableView> {
    return this.tables.resolveGuestToken(qrToken);
  }
}
