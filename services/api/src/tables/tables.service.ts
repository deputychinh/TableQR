import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq } from 'drizzle-orm';
import { CLOCK, type Clock } from '../common/clock.js';
import { ErrorCode } from '../common/enums/error-code.enum.js';
import { DomainError } from '../common/errors/domain.error.js';
import { asTenantId, type TenantId } from '../common/tenant.js';
import { DB, type Database } from '../db/database.module.js';
import { FOREIGN_KEY_VIOLATION, isUniqueViolation, pgCode } from '../db/pg-error.js';
import { bookings, restaurants, tableSessions } from '../db/schema.js';
import { RestaurantStatusService } from '../identity/restaurant-status.service.js';
import { isWellFormedQrToken, newQrToken } from './domain/qr-token.js';
import { TableErrorCode } from './domain/table-error-code.js';
import { TABLES_PER_RESTAURANT_MAX } from './domain/table-rules.js';
import { diningTables, retiredQrTokens } from './tables.schema.js';

const NAME_CONSTRAINT = 'dining_tables_tenant_name_key';

export interface TableView {
  id: string;
  name: string;
  seats: number;
  qrToken: string;
  qrRotatedAt: string | null;
  createdAt: string;
}

export interface GuestTableView {
  restaurant: { name: string; slug: string };
  table: { id: string; name: string; seats: number };
}

export interface TableInput {
  name: string;
  seats: number;
}

const columns = {
  id: diningTables.id,
  name: diningTables.name,
  seats: diningTables.seats,
  qrToken: diningTables.qrToken,
  qrRotatedAt: diningTables.qrRotatedAt,
  createdAt: diningTables.createdAt,
};

type Row = {
  id: string;
  name: string;
  seats: number;
  qrToken: string;
  qrRotatedAt: Date | null;
  createdAt: Date;
};

const toView = (row: Row): TableView => ({
  ...row,
  qrRotatedAt: row.qrRotatedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

const tableNotFound = (): DomainError => new DomainError(ErrorCode.NotFound, 404);

const nameTaken = (): DomainError =>
  new DomainError(TableErrorCode.NameTaken, 409, {
    detail: 'Tên bàn đã có',
    extensions: { fields: [{ path: 'name', code: 'taken' }] },
  });

/**
 * A table that has served guests carries their sessions, bills and bookings; deleting it would
 * erase that history (TQR-007 review), so it is refused. Rename it instead.
 */
const hasHistory = (): DomainError =>
  new DomainError(TableErrorCode.HasHistory, 409, {
    detail: 'Bàn này đã có lượt khách, hoá đơn hoặc đặt bàn nên không xoá được, để giữ lịch sử.',
  });

/** Maps the name unique index to 409; everything else propagates. */
const rethrowNameClash = (error: unknown): never => {
  if (isUniqueViolation(error, NAME_CONSTRAINT)) throw nameTaken();
  throw error;
};

/**
 * Tables and their QR tokens. Every query is scoped by the caller's tenant (ADR 0003); ids arrive
 * already parsed as UUIDs by the controller.
 */
@Injectable()
export class TablesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly restaurantStatus: RestaurantStatusService,
  ) {}

  async list(tenant: TenantId): Promise<TableView[]> {
    const rows = await this.db
      .select(columns)
      .from(diningTables)
      .where(eq(diningTables.restaurantId, tenant))
      .orderBy(asc(diningTables.createdAt), asc(diningTables.id))
      .limit(TABLES_PER_RESTAURANT_MAX);
    return rows.map(toView);
  }

  async get(tenant: TenantId, id: string): Promise<TableView> {
    return toView(await this.findOwn(this.db, tenant, id));
  }

  /** AC8: a new table gets a fresh 128-bit QR token. */
  async create(tenant: TenantId, input: TableInput): Promise<TableView> {
    try {
      return await this.db.transaction(async (tx) => {
        // Serialise creations per restaurant so the cap cannot be overshot by parallel requests.
        await tx
          .select({ id: restaurants.id })
          .from(restaurants)
          .where(eq(restaurants.id, tenant))
          .for('update');
        const [existing] = await tx
          .select({ n: count() })
          .from(diningTables)
          .where(eq(diningTables.restaurantId, tenant));
        if ((existing?.n ?? 0) >= TABLES_PER_RESTAURANT_MAX) {
          throw new DomainError(TableErrorCode.LimitReached, 409, {
            detail: `Tối đa ${String(TABLES_PER_RESTAURANT_MAX)} bàn`,
          });
        }
        const [row] = await tx
          .insert(diningTables)
          .values({ restaurantId: tenant, ...input, qrToken: newQrToken() })
          .returning(columns);
        if (!row) throw new DomainError(ErrorCode.Internal, 500);
        return toView(row);
      });
    } catch (error: unknown) {
      return rethrowNameClash(error);
    }
  }

  async update(tenant: TenantId, id: string, patch: Partial<TableInput>): Promise<TableView> {
    try {
      const [row] = await this.db
        .update(diningTables)
        .set(patch)
        .where(and(eq(diningTables.restaurantId, tenant), eq(diningTables.id, id)))
        .returning(columns);
      if (!row) throw tableNotFound();
      return toView(row);
    } catch (error: unknown) {
      return rethrowNameClash(error);
    }
  }

  /**
   * Deletes a table that never served anyone. One with an open or past session or a booking is
   * refused with 409 `TABLE_HAS_HISTORY`, checked under a row lock so a check-in cannot slip in
   * between; the foreign keys (no cascade) are the last line if anything else does.
   */
  async remove(tenant: TenantId, id: string): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        await this.findOwn(tx, tenant, id, true);
        const [session] = await tx
          .select({ id: tableSessions.id })
          .from(tableSessions)
          .where(and(eq(tableSessions.restaurantId, tenant), eq(tableSessions.tableId, id)))
          .limit(1);
        const [booking] = await tx
          .select({ id: bookings.id })
          .from(bookings)
          .where(and(eq(bookings.restaurantId, tenant), eq(bookings.tableId, id)))
          .limit(1);
        if (session || booking) throw hasHistory();
        await tx
          .delete(diningTables)
          .where(and(eq(diningTables.restaurantId, tenant), eq(diningTables.id, id)));
      });
    } catch (error: unknown) {
      if (pgCode(error) === FOREIGN_KEY_VIOLATION) throw hasHistory();
      throw error;
    }
  }

  /** AC10: a new token replaces the old one; the old one is kept so guests see "expired". */
  async rotateQr(tenant: TenantId, id: string): Promise<TableView> {
    return this.db.transaction(async (tx) => {
      const current = await this.findOwn(tx, tenant, id, true);
      const now = this.clock.now();
      await tx.insert(retiredQrTokens).values({
        qrToken: current.qrToken,
        restaurantId: tenant,
        tableId: current.id,
        retiredAt: now,
      });
      const [row] = await tx
        .update(diningTables)
        .set({ qrToken: newQrToken(), qrRotatedAt: now })
        .where(and(eq(diningTables.restaurantId, tenant), eq(diningTables.id, id)))
        .returning(columns);
      if (!row) throw tableNotFound();
      return toView(row);
    });
  }

  /**
   * Guest entry (AC8, AC10, AC11): the token alone identifies restaurant and table.
   * Unknown or malformed tokens are "not found"; any code of a suspended restaurant answers 403
   * `RESTAURANT_SUSPENDED` (AC54), so the guest reads "Nhà hàng tạm ngưng".
   */
  async resolveGuestToken(token: string): Promise<GuestTableView> {
    if (!isWellFormedQrToken(token)) throw guestTableNotFound();
    const [current] = await this.db
      .select({
        tableId: diningTables.id,
        tableName: diningTables.name,
        seats: diningTables.seats,
        restaurantId: restaurants.id,
        restaurantName: restaurants.name,
        slug: restaurants.slug,
      })
      .from(diningTables)
      .innerJoin(restaurants, eq(restaurants.id, diningTables.restaurantId))
      .where(eq(diningTables.qrToken, token))
      .limit(1);
    if (current) {
      await this.restaurantStatus.assertActive(asTenantId(current.restaurantId));
      return {
        restaurant: { name: current.restaurantName, slug: current.slug },
        table: { id: current.tableId, name: current.tableName, seats: current.seats },
      };
    }
    const [retired] = await this.db
      .select({ restaurantId: retiredQrTokens.restaurantId })
      .from(retiredQrTokens)
      .where(eq(retiredQrTokens.qrToken, token))
      .limit(1);
    if (!retired) throw guestTableNotFound();
    await this.restaurantStatus.assertActive(asTenantId(retired.restaurantId));
    throw new DomainError(TableErrorCode.QrExpired, 410, { detail: 'Mã QR đã hết hạn' });
  }

  private async findOwn(
    executor: Pick<Database, 'select'>,
    tenant: TenantId,
    id: string,
    lock = false,
  ): Promise<Row> {
    const query = executor
      .select(columns)
      .from(diningTables)
      .where(and(eq(diningTables.restaurantId, tenant), eq(diningTables.id, id)))
      .limit(1);
    const [row] = lock ? await query.for('update') : await query;
    if (!row) throw tableNotFound();
    return row;
  }
}

const guestTableNotFound = (): DomainError =>
  new DomainError(TableErrorCode.GuestTableNotFound, 404, { detail: 'Không tìm thấy bàn' });
