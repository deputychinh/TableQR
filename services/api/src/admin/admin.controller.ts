import { Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { uuidParam } from '../common/http/params.js';
import { parseBody } from '../common/http/validate.js';
import { Roles, StaffGuard } from '../identity/guards.js';
import { AdminService, type AdminRestaurant, type Page } from './admin.service.js';

/** List endpoints are capped at 200 (docs/security.md). */
export const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;

const pageSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

/** Spec S16: platform admin only; owners and staff get 403 (deny by default). */
@Controller('admin/restaurants')
@UseGuards(StaffGuard)
@Roles('platform_admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  list(@Query() query: unknown): Promise<Page<AdminRestaurant>> {
    const page = parseBody(pageSchema, query);
    return this.admin.list(page.limit, page.offset);
  }

  @Post(':id/suspend')
  @HttpCode(200)
  suspend(@Param('id') id: string): Promise<AdminRestaurant> {
    return this.admin.setStatus(uuidParam(id), 'suspended');
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  reactivate(@Param('id') id: string): Promise<AdminRestaurant> {
    return this.admin.setStatus(uuidParam(id), 'active');
  }
}
