import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, isNull } from 'drizzle-orm';
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
  /** TQR-024: set while the table is hidden ("Ẩn bàn"). */
  archivedAt: string | null;
  createdAt: string;
}

/** The staff list: tables in use, and the hidden ones apart (TQR-024). */
export interface TableList {
  items: TableView[];
  archived: TableView[];
}

/** A live (not hidden) table that a guest token resolved to. */
export interface LiveTable {
  id: string;
  restaurantId: string;
  seats: number;
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
  archivedAt: diningTables.archivedAt,
  createdAt: diningTables.createdAt,
};

type Row = {
  id: string;
  name: string;
  seats: number;
  qrToken: string;
  qrRotatedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
};

const toView = (row: Row): TableView => ({
  ...row,
  qrRotatedAt: row.qrRotatedAt?.toISOString() ?? null,
  archivedAt: row.archivedAt?.toISOString() ?? null,
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

const inUse = (): DomainError =>
  new DomainError(TableErrorCode.InUse, 409, {
    detail: 'Bàn đang có khách. Hãy thanh toán và đóng bàn trước khi ẩn.',
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

  /** Tables in use in `items`; hidden ones (TQR-024) only in `archived`, never printed or booked. */
  async list(tenant: TenantId): Promise<TableList> {
    const rows = await this.db
      .select(columns)
      .from(diningTables)
      .where(eq(diningTables.restaurantId, tenant))
      .orderBy(asc(diningTables.createdAt), asc(diningTables.id))
      .limit(TABLES_PER_RESTAURANT_MAX);
    const views = rows.map(toView);
    return {
      items: views.filter((table) => table.archivedAt === null),
      archived: views.filter((table) => table.archivedAt !== null),
    };
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

  /**
   * TQR-024 "Ẩn bàn": hides a table that has history instead of deleting it. Refused with 409
   * `TABLE_IN_USE` while guests sit at it (open session, checked under the row lock that check-in
   * also takes). Its sessions, bills and bookings stay; its QR codes answer "not found". Repeating
   * it keeps the first time.
   */
  async archive(tenant: TenantId, id: string): Promise<TableView> {
    return this.db.transaction(async (tx) => {
      const current = await this.findOwn(tx, tenant, id, true);
      if (current.archivedAt) return toView(current);
      const [open] = await tx
        .select({ id: tableSessions.id })
        .from(tableSessions)
        .where(
          and(
            eq(tableSessions.restaurantId, tenant),
            eq(tableSessions.tableId, id),
            eq(tableSessions.status, 'open'),
          ),
        )
        .limit(1);
      if (open) throw inUse();
      return this.setArchivedAt(tx, tenant, id, this.clock.now());
    });
  }

  /** TQR-024 "Hiện lại": the table is back in the list, printable, and its current QR works. */
  async unarchive(tenant: TenantId, id: string): Promise<TableView> {
    return this.db.transaction(async (tx) => {
      await this.findOwn(tx, tenant, id, true);
      return this.setArchivedAt(tx, tenant, id, null);
    });
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
    const live = await this.findLiveByToken(this.db, token);
    if (live) {
      await this.restaurantStatus.assertActive(asTenantId(live.restaurantId));
      const [current] = await this.db
        .select({
          tableName: diningTables.name,
          restaurantName: restaurants.name,
          slug: restaurants.slug,
        })
        .from(diningTables)
        .innerJoin(restaurants, eq(restaurants.id, diningTables.restaurantId))
        .where(and(eq(diningTables.restaurantId, live.restaurantId), eq(diningTables.id, live.id)))
        .limit(1);
      if (!current) throw guestTableNotFound();
      return {
        restaurant: { name: current.restaurantName, slug: current.slug },
        table: { id: live.id, name: current.tableName, seats: live.seats },
      };
    }
    // An old code of a hidden table is "not found" like its current one (TQR-024).
    const [retired] = await this.db
      .select({ restaurantId: retiredQrTokens.restaurantId })
      .from(retiredQrTokens)
      .innerJoin(
        diningTables,
        and(
          eq(diningTables.restaurantId, retiredQrTokens.restaurantId),
          eq(diningTables.id, retiredQrTokens.tableId),
        ),
      )
      .where(and(eq(retiredQrTokens.qrToken, token), isNull(diningTables.archivedAt)))
      .limit(1);
    if (!retired) throw guestTableNotFound();
    await this.restaurantStatus.assertActive(asTenantId(retired.restaurantId));
    throw new DomainError(TableErrorCode.QrExpired, 410, { detail: 'Mã QR đã hết hạn' });
  }

  /**
   * The one place a guest QR token resolves to a table (TQR-024): unknown, malformed and hidden
   * tables are `undefined`. Check-in passes its transaction and locks the row, so it serialises
   * with "Ẩn bàn" (which locks the same row).
   */
  async findLiveByToken(
    executor: Pick<Database, 'select'>,
    token: string,
    lock = false,
  ): Promise<LiveTable | undefined> {
    const query = executor
      .select({
        id: diningTables.id,
        restaurantId: diningTables.restaurantId,
        seats: diningTables.seats,
      })
      .from(diningTables)
      .where(and(eq(diningTables.qrToken, token), isNull(diningTables.archivedAt)))
      .limit(1);
    const [row] = lock ? await query.for('update') : await query;
    return row;
  }

  private async setArchivedAt(
    executor: Pick<Database, 'update'>,
    tenant: TenantId,
    id: string,
    archivedAt: Date | null,
  ): Promise<TableView> {
    const [row] = await executor
      .update(diningTables)
      .set({ archivedAt })
      .where(and(eq(diningTables.restaurantId, tenant), eq(diningTables.id, id)))
      .returning(columns);
    if (!row) throw tableNotFound();
    return toView(row);
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
