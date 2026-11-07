import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ErrorCode } from '../common/enums/error-code.enum.js';
import { DomainError } from '../common/errors/domain.error.js';
import { parseBody } from '../common/http/validate.js';
import type { TenantId } from '../common/tenant.js';
import type { Principal } from '../identity/auth.service.js';
import { CurrentPrincipal, Roles, StaffGuard } from '../identity/guards.js';
import {
  ACCOUNT_NAME_MAX,
  ACCOUNT_NAME_PATTERN,
  ACCOUNT_NUMBER_PATTERN,
  normalizeAccountName,
} from './domain/account-name.js';
import { isKnownBin } from './domain/banks.js';
import { houseRulesSchema } from './domain/house-rules.js';
import { type OwnerSettings, SettingsService, type StaffRules } from './settings.service.js';

const bankSchema = z
  .object({
    bin: z.string().refine(isKnownBin, { message: 'unknown_bank' }),
    accountNumber: z.string().regex(ACCOUNT_NUMBER_PATTERN),
    // Normalised before the checks, so "Nguyễn Văn Ánh" is stored as "NGUYEN VAN ANH".
    accountName: z
      .string()
      .transform(normalizeAccountName)
      .pipe(z.string().min(2).max(ACCOUNT_NAME_MAX).regex(ACCOUNT_NAME_PATTERN)),
  })
  .strict();

const updateSchema = z.object({ rules: houseRulesSchema, bank: bankSchema.nullable() }).strict();

/** Tenant from the session only (ADR 0003); a principal without a restaurant has nothing here. */
const tenantOf = (principal: Principal): TenantId => {
  if (principal.tenantId === null) throw new DomainError(ErrorCode.NotFound, 404);
  return principal.tenantId;
};

@Controller('restaurant')
@UseGuards(StaffGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Owner only: rules + the bank account guests' money goes to. */
  @Get('settings')
  @Roles('owner')
  get(@CurrentPrincipal() principal: Principal): Promise<OwnerSettings> {
    return this.settings.ownerSettings(tenantOf(principal));
  }

  @Put('settings')
  @Roles('owner')
  put(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<OwnerSettings> {
    const input = parseBody(updateSchema, body);
    return this.settings.update(tenantOf(principal), principal.userId, input);
  }

  /** Every role of the restaurant: the rules they work by, no bank details. */
  @Get('rules')
  @Roles('owner', 'cashier', 'waiter', 'kitchen')
  rules(@CurrentPrincipal() principal: Principal): Promise<StaffRules> {
    return this.settings.staffRules(tenantOf(principal));
  }
}
