import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { parseBody } from '../common/http/validate.js';
import { tenantOf } from '../common/tenant.js';
import type { Principal } from '../identity/auth.service.js';
import { MAX_PASSWORD_LENGTH } from '../identity/domain/password.js';
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

const updateSchema = z
  .object({
    rules: houseRulesSchema,
    bank: bankSchema.nullable(),
    // Step-up (TQR-023): required only when `bank` differs from the stored account.
    currentPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH).optional(),
  })
  .strict();

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

  /** A new or removed bank account also needs `currentPassword` (TQR-023); rules alone do not. */
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
