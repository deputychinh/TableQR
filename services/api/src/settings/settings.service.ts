import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { CLOCK, type Clock } from '../common/clock.js';
import { ErrorCode } from '../common/enums/error-code.enum.js';
import { DomainError } from '../common/errors/domain.error.js';
import { AppLogger } from '../common/logging/app-logger.js';
import type { TenantId } from '../common/tenant.js';
import { DB, type Database } from '../db/database.module.js';
import { restaurants } from '../db/schema.js';
import { maskAccountNumber } from './domain/account-name.js';
import { type Bank, VIETNAM_BANKS, bankByBin } from './domain/banks.js';
import { type HouseRules, readStoredRules, sameRules } from './domain/house-rules.js';

export interface BankAccount {
  bin: string;
  accountNumber: string;
  /** Already normalised (upper-case ASCII, no accents). */
  accountName: string;
}

/** Owner view: rules, the full bank account and the list of banks to choose from. */
export interface OwnerSettings {
  rules: HouseRules;
  rulesUpdatedAt: string | null;
  bank: (BankAccount & { bankName: string }) | null;
  bankChangedAt: string | null;
  banks: readonly Bank[];
}

/** Staff view: what any role needs to work, never the bank details. */
export interface StaffRules {
  rules: HouseRules;
  rulesUpdatedAt: string | null;
  /** False → bills say "Thanh toán tại quầy" (AC41). */
  bankConfigured: boolean;
  /** The cashier screen warns for 24 h after a change (docs/security.md). */
  bankChangedAt: string | null;
}

type Row = typeof restaurants.$inferSelect;

const iso = (date: Date | null): string | null => (date === null ? null : date.toISOString());

const bankOf = (row: Row): BankAccount | null =>
  row.bankBin !== null && row.bankAccount !== null && row.bankAccountName !== null
    ? { bin: row.bankBin, accountNumber: row.bankAccount, accountName: row.bankAccountName }
    : null;

const sameBank = (a: BankAccount | null, b: BankAccount | null): boolean =>
  a === null || b === null
    ? a === b
    : a.bin === b.bin && a.accountNumber === b.accountNumber && a.accountName === b.accountName;

@Injectable()
export class SettingsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly logger: AppLogger,
  ) {}

  async ownerSettings(tenantId: TenantId): Promise<OwnerSettings> {
    return this.toOwnerSettings(await this.load(this.db, tenantId));
  }

  async staffRules(tenantId: TenantId): Promise<StaffRules> {
    const row = await this.load(this.db, tenantId);
    return {
      rules: readStoredRules(row.rules),
      rulesUpdatedAt: iso(row.rulesUpdatedAt),
      bankConfigured: bankOf(row) !== null,
      bankChangedAt: iso(row.bankChangedAt),
    };
  }

  /**
   * Replaces the rules and the bank account in one transaction (row locked). The rules version
   * (`rules_updated_at`, AC12) and `bank_changed_at` move only when the value really changed, so
   * saving an untouched form creates no new version and no false "bank changed" warning.
   */
  async update(
    tenantId: TenantId,
    userId: string,
    input: { rules: HouseRules; bank: BankAccount | null },
  ): Promise<OwnerSettings> {
    const now = this.clock.now();
    const { row, bankChanged, previous } = await this.db.transaction(async (tx) => {
      const current = await this.load(tx, tenantId, true);
      const rulesChanged = !sameRules(readStoredRules(current.rules), input.rules);
      const before = bankOf(current);
      const changed = !sameBank(before, input.bank);
      if (!rulesChanged && !changed) return { row: current, bankChanged: false, previous: before };
      const [updated] = await tx
        .update(restaurants)
        .set({
          ...(rulesChanged ? { rules: input.rules, rulesUpdatedAt: now } : {}),
          ...(changed
            ? {
                bankBin: input.bank?.bin ?? null,
                bankAccount: input.bank?.accountNumber ?? null,
                bankAccountName: input.bank?.accountName ?? null,
                bankChangedAt: now,
              }
            : {}),
        })
        .where(eq(restaurants.id, tenantId))
        .returning();
      if (!updated) throw new DomainError(ErrorCode.NotFound, 404);
      return { row: updated, bankChanged: changed, previous: before };
    });
    if (bankChanged) {
      // Audit trail (docs/security.md: tampering with the bank account). Never the full number.
      this.logger.info('bank_account_changed', {
        restaurantId: tenantId,
        byUserId: userId,
        at: now.toISOString(),
        fromBin: previous?.bin ?? null,
        fromAccountLast3: previous ? maskAccountNumber(previous.accountNumber) : null,
        toBin: input.bank?.bin ?? null,
        toAccountLast3: input.bank ? maskAccountNumber(input.bank.accountNumber) : null,
      });
    }
    return this.toOwnerSettings(row);
  }

  private async load(
    executor: Pick<Database, 'select'>,
    tenantId: TenantId,
    forUpdate = false,
  ): Promise<Row> {
    const query = executor.select().from(restaurants).where(eq(restaurants.id, tenantId)).limit(1);
    const [row] = forUpdate ? await query.for('update') : await query;
    if (!row) throw new DomainError(ErrorCode.NotFound, 404);
    return row;
  }

  private toOwnerSettings(row: Row): OwnerSettings {
    const bank = bankOf(row);
    return {
      rules: readStoredRules(row.rules),
      rulesUpdatedAt: iso(row.rulesUpdatedAt),
      bank:
        bank === null ? null : { ...bank, bankName: bankByBin(bank.bin)?.shortName ?? bank.bin },
      bankChangedAt: iso(row.bankChangedAt),
      banks: VIETNAM_BANKS,
    };
  }
}
