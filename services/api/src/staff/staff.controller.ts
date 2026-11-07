import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { uuidParam } from '../common/http/params.js';
import { parseBody } from '../common/http/validate.js';
import { tenantOf } from '../common/tenant.js';
import type { Principal } from '../identity/auth.service.js';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../identity/domain/password.js';
import { CurrentPrincipal, Roles, StaffGuard } from '../identity/guards.js';
import {
  MAX_DISPLAY_NAME_LENGTH,
  MIN_DISPLAY_NAME_LENGTH,
  NEW_STAFF_ROLES,
  RESTAURANT_ROLES,
} from './domain/staff-rules.js';
import { StaffService, type StaffMember } from './staff.service.js';

const displayName = z.string().trim().min(MIN_DISPLAY_NAME_LENGTH).max(MAX_DISPLAY_NAME_LENGTH);
const password = z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH);

const createSchema = z
  .object({
    displayName,
    email: z.string().trim().email().max(254),
    password,
    role: z.enum(NEW_STAFF_ROLES),
  })
  .strict();

const updateSchema = z
  .object({
    displayName: displayName.optional(),
    role: z.enum(RESTAURANT_ROLES).optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, { message: 'empty' });

const passwordSchema = z.object({ password }).strict();

/** Spec S5: only the owner manages staff accounts (AC15 deny-by-default for everyone else). */
@Controller('staff')
@UseGuards(StaffGuard)
@Roles('owner')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  async list(@CurrentPrincipal() principal: Principal): Promise<{ items: StaffMember[] }> {
    return { items: await this.staff.list(tenantOf(principal)) };
  }

  @Post()
  @HttpCode(201)
  create(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<StaffMember> {
    return this.staff.create(tenantOf(principal), parseBody(createSchema, body));
  }

  @Get(':id')
  get(@CurrentPrincipal() principal: Principal, @Param('id') id: string): Promise<StaffMember> {
    return this.staff.get(tenantOf(principal), uuidParam(id));
  }

  @Patch(':id')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<StaffMember> {
    const input = parseBody(updateSchema, body);
    return this.staff.update(tenantOf(principal), principal.userId, uuidParam(id), {
      displayName: input.displayName,
      role: input.role,
      disabled: input.active === undefined ? undefined : !input.active,
    });
  }

  /** The owner sets a new password for the person; their sessions end (AC16). */
  @Put(':id/password')
  @HttpCode(204)
  async resetPassword(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<void> {
    const input = parseBody(passwordSchema, body);
    await this.staff.update(tenantOf(principal), principal.userId, uuidParam(id), {
      password: input.password,
    });
  }
}
