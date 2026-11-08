import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { CLOCK, type Clock } from '../common/clock.js';
import { ErrorCode } from '../common/enums/error-code.enum.js';
import { DomainError } from '../common/errors/domain.error.js';
import { asTenantId, type TenantId } from '../common/tenant.js';
import { DB, type Database } from '../db/database.module.js';
import { restaurants } from '../db/schema.js';
import { hashToken, newSessionToken } from '../identity/domain/session-token.js';
import { RestaurantStatusService } from '../identity/restaurant-status.service.js';
import { readStoredRules } from '../settings/domain/house-rules.js';
import { diningTables } from '../tables/tables.schema.js';
import { TablesService } from '../tables/tables.service.js';
import { isUuid, isValidPartySize, maxPartySize } from './domain/ordering.js';
import {
  guestNotCheckedIn,
  partySizeRequired,
  sessionAlreadyOpen,
  sessionClosed,
  waitForStaff,
} from './domain/service-errors.js';
import { OrdersService, type OrderView, type Tx } from './orders.service.js';
import { guestDevices, tableSessions } from './service.schema.js';

/** The table session a guest phone belongs to (resolved from its cookie, never from input). */
export interface GuestContext {
  tenant: TenantId;
  sessionId: string;
  status: 'open' | 'closed';
}

export interface SessionView {
  id: string;
  tableId: string;
  partySize: number;
  status: 'open' | 'closed';
  openedAt: string;
  openedBy: 'guest' | 'staff' | 'booking';
}

export interface GuestSessionView {
  restaurant: { name: string; slug: string };
  table: { name: string; seats: number };
  session: { id: string; partySize: number; status: 'open' | 'closed'; openedAt: string };
  orders: OrderView[];
}

/** What a scan leads to, asked before check-in so the expected "party size" step is no error. */
export interface CheckInNext {
  next: 'join' | 'party_size' | 'wait_for_staff';
  maxPartySize: number;
}

export interface CheckInResult {
  session: SessionView;
  /** A new device token to set as the guest cookie; undefined when the phone already belongs here. */
  deviceToken?: string;
  /** True when this call opened the session (AC17), false when it joined one (AC18). */
  opened: boolean;
}

const notFound = (): DomainError => new DomainError(ErrorCode.NotFound, 404);

const partySizeInvalid = (max: number): DomainError =>
  new DomainError(ErrorCode.ValidationFailed, 422, {
    detail: `Số người từ 1 đến ${String(max)}.`,
    extensions: { fields: [{ path: 'partySize', code: 'out_of_range' }], maxPartySize: max },
  });

const sessionColumns = {
  id: tableSessions.id,
  tableId: tableSessions.tableId,
  partySize: tableSessions.partySize,
  status: tableSessions.status,
  openedAt: tableSessions.openedAt,
  openedBy: tableSessions.openedBy,
};

const toSessionView = (row: {
  id: string;
  tableId: string;
  partySize: number;
  status: 'open' | 'closed';
  openedAt: Date;
  openedBy: 'guest' | 'staff' | 'booking';
}): SessionView => ({ ...row, openedAt: row.openedAt.toISOString() });

/**
 * Table sessions (spec S6): guest check-in / join by QR token with the `tqr_guest` device cookie,
 * and staff opening a table or changing its party size.
 */
@Injectable()
export class SessionsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly restaurantStatus: RestaurantStatusService,
    private readonly tables: TablesService,
    private readonly orders: OrdersService,
  ) {}

  // --- guest -----------------------------------------------------------------

  /**
   * AC17–AC19: joins the table's open session, or opens one with the party size when the rule is
   * "self check-in". The table row is locked so two phones scanning at once end in one session.
   */
  async checkIn(
    qrToken: string,
    partySize: number | undefined,
    currentDeviceToken: string | undefined,
  ): Promise<CheckInResult> {
    const result = await this.db.transaction(async (tx) => {
      // The one token resolver (hidden tables are "not found"); locks the row like "Ẩn bàn" does.
      const table = await this.tables.findLiveByToken(tx, qrToken, true);
      if (!table) return undefined;
      const tenant = asTenantId(table.restaurantId);
      await this.restaurantStatus.assertActive(tenant);

      const [open] = await tx
        .select(sessionColumns)
        .from(tableSessions)
        .where(
          and(
            eq(tableSessions.restaurantId, tenant),
            eq(tableSessions.tableId, table.id),
            eq(tableSessions.status, 'open'),
          ),
        );
      if (open) {
        if (await this.deviceBelongsTo(tx, currentDeviceToken, open.id)) {
          return { session: toSessionView(open), opened: false };
        }
        return {
          session: toSessionView(open),
          deviceToken: await this.addDevice(tx, tenant, open.id),
          opened: false,
        };
      }

      const [restaurant] = await tx
        .select({ rules: restaurants.rules })
        .from(restaurants)
        .where(eq(restaurants.id, tenant));
      if (readStoredRules(restaurant?.rules).sessionOpening === 'staff_opens') throw waitForStaff();
      const max = maxPartySize(table.seats);
      if (partySize === undefined) throw partySizeRequired(max);
      if (!isValidPartySize(partySize, table.seats)) throw partySizeInvalid(max);
      const [created] = await tx
        .insert(tableSessions)
        .values({
          restaurantId: tenant,
          tableId: table.id,
          partySize,
          openedAt: this.clock.now(),
          openedBy: 'guest',
        })
        .returning(sessionColumns);
      if (!created) throw new Error('session insert returned no row');
      return {
        session: toSessionView(created),
        deviceToken: await this.addDevice(tx, tenant, created.id),
        opened: true,
      };
    });
    // Unknown, retired (410) or suspended-restaurant tokens answer exactly as the table page does.
    if (!result) {
      await this.tables.resolveGuestToken(qrToken);
      throw notFound();
    }
    return result;
  }

  /**
   * TQR-011: the step a scan leads to — join the open session, ask the party size (self check-in)
   * or wait for staff — without opening anything. Same 404 / 410 / 403 answers as check-in.
   */
  async checkInNext(qrToken: string): Promise<CheckInNext> {
    const table = await this.tables.findLiveByToken(this.db, qrToken);
    if (!table) {
      await this.tables.resolveGuestToken(qrToken);
      throw notFound();
    }
    const tenant = asTenantId(table.restaurantId);
    await this.restaurantStatus.assertActive(tenant);
    const [restaurant] = await this.db
      .select({ rules: restaurants.rules })
      .from(restaurants)
      .where(eq(restaurants.id, tenant));
    const maxPartySizeOfTable = maxPartySize(table.seats);
    const [open] = await this.db
      .select({ id: tableSessions.id })
      .from(tableSessions)
      .where(
        and(
          eq(tableSessions.restaurantId, tenant),
          eq(tableSessions.tableId, table.id),
          eq(tableSessions.status, 'open'),
        ),
      );
    if (open) return { next: 'join', maxPartySize: maxPartySizeOfTable };
    return {
      next:
        readStoredRules(restaurant?.rules).sessionOpening === 'staff_opens'
          ? 'wait_for_staff'
          : 'party_size',
      maxPartySize: maxPartySizeOfTable,
    };
  }

  /** The phone's session from its cookie; 401 without one, 403 when the restaurant is suspended. */
  async guestContext(deviceToken: string | undefined): Promise<GuestContext> {
    if (!deviceToken) throw guestNotCheckedIn();
    const [row] = await this.db
      .select({
        tenant: guestDevices.restaurantId,
        sessionId: guestDevices.sessionId,
        status: tableSessions.status,
      })
      .from(guestDevices)
      .innerJoin(
        tableSessions,
        and(
          eq(tableSessions.restaurantId, guestDevices.restaurantId),
          eq(tableSessions.id, guestDevices.sessionId),
        ),
      )
      .where(eq(guestDevices.tokenHash, hashToken(deviceToken)));
    if (!row) throw guestNotCheckedIn();
    const tenant = asTenantId(row.tenant);
    await this.restaurantStatus.assertActive(tenant);
    return { tenant, sessionId: row.sessionId, status: row.status };
  }

  /** AC21: a closed session takes no more orders from the phones that joined it. */
  assertOpen(context: GuestContext): void {
    if (context.status !== 'open') throw sessionClosed();
  }

  /** What the guest's order page shows: table, party, every order with its items' statuses. */
  async guestView(context: GuestContext): Promise<GuestSessionView> {
    const [row] = await this.db
      .select({
        restaurantName: restaurants.name,
        slug: restaurants.slug,
        tableName: diningTables.name,
        seats: diningTables.seats,
        ...sessionColumns,
      })
      .from(tableSessions)
      .innerJoin(restaurants, eq(restaurants.id, tableSessions.restaurantId))
      .innerJoin(
        diningTables,
        and(
          eq(diningTables.restaurantId, tableSessions.restaurantId),
          eq(diningTables.id, tableSessions.tableId),
        ),
      )
      .where(
        and(
          eq(tableSessions.restaurantId, context.tenant),
          eq(tableSessions.id, context.sessionId),
        ),
      );
    if (!row) throw guestNotCheckedIn();
    return {
      restaurant: { name: row.restaurantName, slug: row.slug },
      table: { name: row.tableName, seats: row.seats },
      session: {
        id: row.id,
        partySize: row.partySize,
        status: row.status,
        openedAt: row.openedAt.toISOString(),
      },
      orders: await this.orders.sessionOrders(context.tenant, context.sessionId),
    };
  }

  async slugOf(tenant: TenantId): Promise<string> {
    const [row] = await this.db
      .select({ slug: restaurants.slug })
      .from(restaurants)
      .where(eq(restaurants.id, tenant));
    if (!row) throw notFound();
    return row.slug;
  }

  // --- staff -----------------------------------------------------------------

  /** Staff opens a table for a party (rule "staff opens", or a guest without a phone). */
  async open(tenant: TenantId, tableId: string, partySize: number): Promise<SessionView> {
    if (!isUuid(tableId)) throw notFound();
    return this.db.transaction(async (tx) => {
      const [table] = await tx
        .select({ id: diningTables.id, seats: diningTables.seats })
        .from(diningTables)
        .where(
          and(
            eq(diningTables.restaurantId, tenant),
            eq(diningTables.id, tableId),
            // A hidden table (TQR-024) takes no guests; "Hiện lại" first.
            isNull(diningTables.archivedAt),
          ),
        )
        .for('update');
      if (!table) throw notFound();
      if (!isValidPartySize(partySize, table.seats)) {
        throw partySizeInvalid(maxPartySize(table.seats));
      }
      const [open] = await tx
        .select({ id: tableSessions.id })
        .from(tableSessions)
        .where(
          and(
            eq(tableSessions.restaurantId, tenant),
            eq(tableSessions.tableId, tableId),
            eq(tableSessions.status, 'open'),
          ),
        );
      if (open) throw sessionAlreadyOpen();
      const [created] = await tx
        .insert(tableSessions)
        .values({
          restaurantId: tenant,
          tableId,
          partySize,
          openedAt: this.clock.now(),
          openedBy: 'staff',
        })
        .returning(sessionColumns);
      if (!created) throw new Error('session insert returned no row');
      return toSessionView(created);
    });
  }

  /** AC20: a new party size re-runs the anomaly check on the session's held orders. */
  async changePartySize(
    tenant: TenantId,
    sessionId: string,
    partySize: number,
  ): Promise<SessionView> {
    if (!isUuid(sessionId)) throw notFound();
    return this.db.transaction(async (tx) => {
      const [session] = await tx
        .select({ ...sessionColumns, seats: diningTables.seats })
        .from(tableSessions)
        .innerJoin(
          diningTables,
          and(
            eq(diningTables.restaurantId, tableSessions.restaurantId),
            eq(diningTables.id, tableSessions.tableId),
          ),
        )
        .where(and(eq(tableSessions.restaurantId, tenant), eq(tableSessions.id, sessionId)))
        .for('update', { of: tableSessions });
      if (!session) throw notFound();
      if (session.status !== 'open') throw sessionClosed();
      if (!isValidPartySize(partySize, session.seats)) {
        throw partySizeInvalid(maxPartySize(session.seats));
      }
      const [updated] = await tx
        .update(tableSessions)
        .set({ partySize })
        .where(and(eq(tableSessions.restaurantId, tenant), eq(tableSessions.id, sessionId)))
        .returning(sessionColumns);
      if (!updated) throw notFound();
      await this.orders.recheckHeld(tx, tenant, sessionId, partySize);
      return toSessionView(updated);
    });
  }

  // --- internals -------------------------------------------------------------

  private async deviceBelongsTo(
    tx: Tx,
    deviceToken: string | undefined,
    sessionId: string,
  ): Promise<boolean> {
    if (!deviceToken) return false;
    const [device] = await tx
      .select({ sessionId: guestDevices.sessionId })
      .from(guestDevices)
      .where(eq(guestDevices.tokenHash, hashToken(deviceToken)));
    return device?.sessionId === sessionId;
  }

  /** 256-bit random token for the cookie; only its SHA-256 is stored (ADR 0002 §3). */
  private async addDevice(tx: Tx, tenant: TenantId, sessionId: string): Promise<string> {
    const token = newSessionToken();
    await tx
      .insert(guestDevices)
      .values({ tokenHash: hashToken(token), restaurantId: tenant, sessionId });
    return token;
  }
}
