import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../common/clock.js';
import { ErrorCode } from '../common/enums/error-code.enum.js';
import { DomainError } from '../common/errors/domain.error.js';
import { AppLogger } from '../common/logging/app-logger.js';
import { asTenantId, type TenantId } from '../common/tenant.js';
import { isUuid } from '../common/http/params.js';
import { DB, type Database } from '../db/database.module.js';
import { restaurants, users } from '../db/schema.js';
import { hashToken } from '../identity/domain/session-token.js';
import { publish } from '../realtime/publisher.js';
import { guestDevices, orderItems, orders, tableSessions } from '../service/service.schema.js';
import { bankByBin } from '../settings/domain/banks.js';
import { readStoredRules } from '../settings/domain/house-rules.js';
import { qrPaymentActive } from '../settings/domain/qr-payment.js';
import { diningTables } from '../tables/tables.schema.js';
import {
  billableIn,
  publishBill,
  sessionAmounts,
  syncOpenBill,
  type BillRow,
  type Executor,
} from './bill-sync.js';
import { bills } from './billing.schema.js';
import { billMemo } from './domain/bill-code.js';
import { BillingErrorCode } from './domain/billing-error-code.js';
import {
  closeNeedsReason,
  isBankChangeRecent,
  payerName,
  type PaymentMethod,
} from './domain/cashier-rules.js';
import { amountDue } from './domain/totals.js';
import { VietQrInputError, buildVietQr } from './domain/vietqr.js';

const LINES_MAX = 500;
const OVERVIEW_MAX = 200;

export type BillStatus = 'open' | 'superseded' | 'paid';

export interface BillView {
  id: string;
  code: string;
  memo: string;
  amountVnd: number;
  status: BillStatus;
  createdAt: string;
  paidAt: string | null;
  method: PaymentMethod | null;
}

export interface BillLine {
  id: string;
  name: string;
  quantity: number;
  priceVnd: number;
  lineTotalVnd: number;
}

/** What a guest (or staff) sees for one session's bill (S12). */
export interface SessionBillView {
  restaurantName: string;
  session: { id: string; tableName: string; status: 'open' | 'closed' };
  lines: BillLine[];
  totalVnd: number;
  paidVnd: number;
  dueVnd: number;
  /** The open bill, else the latest one; null before any bill. */
  bill: BillView | null;
  /**
   * VietQR transfer details for an open bill; null = pay at the counter (AC41: QR option off or no
   * bank account, TQR-029) or nothing open.
   */
  transfer: {
    payload: string;
    bankName: string;
    accountNumber: string;
    accountName: string;
  } | null;
  /** True when the restaurant takes no QR transfer: "Thanh toán tại quầy" (AC41, TQR-029). */
  payAtCounter: boolean;
}

export interface CashierSession {
  sessionId: string;
  tableName: string;
  partySize: number;
  openedAt: string;
  totalVnd: number;
  paidVnd: number;
  dueVnd: number;
  bill: (BillView & PaidBy) | null;
}

/** Who confirmed a paid bill, never blank (TQR-019). */
export interface PaidBy {
  /** Display name; without one "Chủ quán" for the owner, else the email's local part. */
  paidByName: string | null;
}

export interface CashierOverview {
  sessions: CashierSession[];
  bankConfigured: boolean;
  /** TQR-029: QR option on and an account stored; off → the screen offers only "Đã nhận tiền". */
  qrEnabled: boolean;
  bankChangedAt: string | null;
  /** docs/security.md: show "Tài khoản nhận tiền vừa đổi" for 24 h after a change. */
  bankChangedRecently: boolean;
}

export interface GuestContext {
  tenant: TenantId;
  sessionId: string;
}

const toBillView = (row: BillRow): BillView => ({
  id: row.id,
  code: row.code,
  memo: billMemo(row.code),
  amountVnd: row.amountVnd,
  status: row.status,
  createdAt: row.createdAt.toISOString(),
  paidAt: row.paidAt?.toISOString() ?? null,
  method: row.method,
});

const notFound = (): DomainError => new DomainError(ErrorCode.NotFound, 404);

const guestSessionRequired = (): DomainError =>
  new DomainError(BillingErrorCode.GuestSessionRequired, 401, {
    detail: 'Hãy quét mã QR trên bàn để xem hoá đơn',
  });

/**
 * Bills, VietQR and payment confirmation (spec S12/S13, ADR 0006). Every query carries the tenant
 * from the staff session or the guest cookie (ADR 0003); writes that change what a session owes
 * lock the session row first, so bill requests, payments and closing never interleave.
 */
@Injectable()
export class BillingService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly logger: AppLogger,
  ) {}

  /** The `tqr_guest` cookie → the open session this phone joined (ADR 0002 §3); else 401. */
  async guestContext(token: string | undefined): Promise<GuestContext> {
    if (!token) throw guestSessionRequired();
    const [row] = await this.db
      .select({ restaurantId: guestDevices.restaurantId, sessionId: guestDevices.sessionId })
      .from(guestDevices)
      .innerJoin(
        tableSessions,
        and(
          eq(tableSessions.restaurantId, guestDevices.restaurantId),
          eq(tableSessions.id, guestDevices.sessionId),
        ),
      )
      .innerJoin(restaurants, eq(restaurants.id, guestDevices.restaurantId))
      .where(
        and(
          eq(guestDevices.tokenHash, hashToken(token)),
          eq(tableSessions.status, 'open'),
          eq(restaurants.status, 'active'),
        ),
      )
      .limit(1);
    if (!row) throw guestSessionRequired();
    return { tenant: asTenantId(row.restaurantId), sessionId: row.sessionId };
  }

  /** The session's bill as it stands, without issuing anything. */
  async view(tenant: TenantId, sessionId: string): Promise<SessionBillView> {
    if (!isUuid(sessionId)) throw notFound();
    return this.buildView(this.db, tenant, sessionId);
  }

  /**
   * AC40/AC42: snapshot the session's billable items. Same amount as the open bill → keep it;
   * a different amount → supersede it and issue a new code; nothing due → no open bill.
   */
  async requestBill(tenant: TenantId, sessionId: string): Promise<SessionBillView> {
    if (!isUuid(sessionId)) throw notFound();
    await this.db.transaction(async (tx) => {
      const session = await this.lockSession(tx, tenant, sessionId);
      if (session.status !== 'open') {
        throw new DomainError(BillingErrorCode.SessionClosed, 409, { detail: 'Bàn đã đóng' });
      }
      await syncOpenBill(tx, tenant, sessionId, this.clock.now(), { issueWhenNone: true });
    });
    return this.buildView(this.db, tenant, sessionId);
  }

  /**
   * AC44/AC45: cashier or owner confirms the money arrived. Compare-and-set on `status = 'open'`:
   * the second confirmation gets 409 `ALREADY_PAID`; a superseded code gets 409 `BILL_SUPERSEDED`.
   * Pay-before-cooking orders the bill covered go to the kitchen in the same transaction (AC13).
   */
  async pay(
    tenant: TenantId,
    userId: string,
    billId: string,
    method: PaymentMethod,
  ): Promise<SessionBillView> {
    if (!isUuid(billId)) throw notFound();
    const { sessionId, paid, released } = await this.db.transaction(async (tx) => {
      const [target] = await tx
        .select({ sessionId: bills.sessionId })
        .from(bills)
        .where(and(eq(bills.restaurantId, tenant), eq(bills.id, billId)))
        .limit(1);
      if (!target) throw notFound();
      const session = await this.lockSession(tx, tenant, target.sessionId);
      if (session.status !== 'open') {
        // Closing supersedes open bills; never release food into a closed table.
        throw new DomainError(BillingErrorCode.SessionClosed, 409, { detail: 'Bàn đã đóng' });
      }
      const now = this.clock.now();
      const [row] = await tx
        .update(bills)
        .set({ status: 'paid', paidAt: now, paidBy: userId, method })
        .where(and(eq(bills.restaurantId, tenant), eq(bills.id, billId), eq(bills.status, 'open')))
        .returning();
      if (!row) {
        const [current] = await tx
          .select({ status: bills.status })
          .from(bills)
          .where(and(eq(bills.restaurantId, tenant), eq(bills.id, billId)))
          .limit(1);
        if (current?.status === 'paid') {
          throw new DomainError(BillingErrorCode.AlreadyPaid, 409, {
            detail: 'Hoá đơn này đã được xác nhận thanh toán',
          });
        }
        throw new DomainError(BillingErrorCode.BillSuperseded, 409, {
          detail: 'Hoá đơn đã thay đổi',
        });
      }
      await publishBill(tx, tenant, row.sessionId, row);
      // Everything paid up → every pay-before order goes to the kitchen (also covers a reused bill
      // whose orders changed at the same amount); otherwise only orders placed before the bill.
      const { dueVnd } = await sessionAmounts(tx, tenant, row.sessionId);
      const coveredUntil = dueVnd === 0 ? null : row.createdAt;
      const count = await this.releaseAfterPayment(tx, tenant, row.sessionId, coveredUntil, now);
      // AC42: money still due after this payment gets its own bill, live on the guest's page.
      await syncOpenBill(tx, tenant, row.sessionId, now, { issueWhenNone: dueVnd > 0 });
      return { sessionId: row.sessionId, paid: row, released: count };
    });
    // Audit trail (docs/security.md, repudiation): who confirmed which bill, how and when.
    this.logger.info('bill_paid', {
      restaurantId: tenant,
      billId,
      sessionId,
      byUserId: userId,
      method,
      amountVnd: paid.amountVnd,
      at: paid.paidAt?.toISOString() ?? null,
      releasedItems: released,
    });
    return this.buildView(this.db, tenant, sessionId);
  }

  /**
   * AC13 + ADR 0005: orders of `sessionId` waiting for payment and placed up to `coveredUntil`
   * (null = all of them) go to the kitchen: order → `released` (released_at = `paidAt`), items
   * `pending` → `waiting` with `queue_at = paidAt`. Publishes `item.status` on the item's station,
   * the floor and the guest session. Runs inside the caller's transaction; returns items released.
   */
  async releaseAfterPayment(
    tx: Executor,
    tenant: TenantId,
    sessionId: string,
    coveredUntil: Date | null,
    paidAt: Date,
  ): Promise<number> {
    const released = await tx
      .update(orders)
      .set({ status: 'released', releasedAt: paidAt })
      .where(
        and(
          eq(orders.restaurantId, tenant),
          eq(orders.sessionId, sessionId),
          eq(orders.status, 'awaiting_payment'),
          coveredUntil === null ? undefined : lte(orders.requestedAt, coveredUntil),
        ),
      )
      .returning({ id: orders.id });
    if (released.length === 0) return 0;
    // TQR-016: the guest's order cards leave "Chờ thanh toán" without a reload.
    for (const order of released) {
      for (const topic of ['floor', `session:${sessionId}`]) {
        await publish(tx, {
          restaurantId: tenant,
          topic,
          type: 'order.status',
          data: { orderId: order.id, status: 'released' },
        });
      }
    }
    const items = await tx
      .update(orderItems)
      .set({ status: 'waiting', queueAt: paidAt, version: sql`${orderItems.version} + 1` })
      .where(
        and(
          eq(orderItems.restaurantId, tenant),
          inArray(
            orderItems.orderId,
            released.map((order) => order.id),
          ),
          eq(orderItems.status, 'pending'),
        ),
      )
      .returning({
        id: orderItems.id,
        orderId: orderItems.orderId,
        stationId: orderItems.stationId,
        version: orderItems.version,
      });
    for (const item of items) {
      const data = {
        itemId: item.id,
        orderId: item.orderId,
        sessionId,
        status: 'waiting',
        version: item.version,
      };
      for (const topic of [`station:${item.stationId}`, 'floor', `session:${sessionId}`]) {
        await publish(tx, { restaurantId: tenant, topic, type: 'item.status', data });
      }
    }
    return items.length;
  }

  /**
   * AC46/AC47: closing frees the table for a new session; a session that still owes money needs a
   * reason, which is stored. Guest phones of the session are signed out (ADR 0002 §3).
   */
  async closeSession(
    tenant: TenantId,
    userId: string,
    sessionId: string,
    reason: string | undefined,
  ): Promise<{ sessionId: string; status: 'closed'; closeReason: string | null }> {
    if (!isUuid(sessionId)) throw notFound();
    const result = await this.db.transaction(async (tx) => {
      const session = await this.lockSession(tx, tenant, sessionId);
      if (session.status !== 'open') {
        throw new DomainError(BillingErrorCode.SessionClosed, 409, { detail: 'Bàn đã đóng' });
      }
      const { dueVnd } = await sessionAmounts(tx, tenant, sessionId);
      if (closeNeedsReason(dueVnd) && reason === undefined) {
        throw new DomainError(BillingErrorCode.CloseReasonRequired, 422, {
          detail: 'Bàn chưa thanh toán: hãy ghi lý do đóng bàn',
          extensions: { fields: [{ path: 'reason', code: 'required' }], dueVnd },
        });
      }
      const now = this.clock.now();
      // Nothing of a closed table stays payable or waiting: open bills are superseded, orders still
      // held or waiting for payment are cancelled with their pending items.
      const superseded = await tx
        .update(bills)
        .set({ status: 'superseded' })
        .where(
          and(
            eq(bills.restaurantId, tenant),
            eq(bills.sessionId, sessionId),
            eq(bills.status, 'open'),
          ),
        )
        .returning();
      for (const bill of superseded) await publishBill(tx, tenant, sessionId, bill);
      const dropped = await tx
        .update(orders)
        .set({ status: 'cancelled' })
        .where(
          and(
            eq(orders.restaurantId, tenant),
            eq(orders.sessionId, sessionId),
            inArray(orders.status, ['held', 'awaiting_payment']),
          ),
        )
        .returning({ id: orders.id });
      if (dropped.length > 0) {
        await tx
          .update(orderItems)
          .set({ status: 'cancelled', version: sql`${orderItems.version} + 1` })
          .where(
            and(
              eq(orderItems.restaurantId, tenant),
              inArray(
                orderItems.orderId,
                dropped.map((order) => order.id),
              ),
              eq(orderItems.status, 'pending'),
            ),
          );
      }
      await tx
        .update(tableSessions)
        .set({ status: 'closed', closedAt: now, closeReason: reason ?? null })
        .where(and(eq(tableSessions.restaurantId, tenant), eq(tableSessions.id, sessionId)));
      await tx
        .delete(guestDevices)
        .where(and(eq(guestDevices.restaurantId, tenant), eq(guestDevices.sessionId, sessionId)));
      const data = { sessionId, tableId: session.tableId, status: 'closed' };
      for (const topic of ['floor', `session:${sessionId}`]) {
        await publish(tx, { restaurantId: tenant, topic, type: 'session.status', data });
      }
      return { dueVnd, at: now };
    });
    this.logger.info('session_closed', {
      restaurantId: tenant,
      sessionId,
      byUserId: userId,
      unpaidVnd: result.dueVnd,
      withReason: reason !== undefined,
      at: result.at.toISOString(),
    });
    return { sessionId, status: 'closed', closeReason: reason ?? null };
  }

  /** One bill by id (staff), e.g. to check an old code: status `superseded` = "Hoá đơn đã thay đổi". */
  async getBill(tenant: TenantId, billId: string): Promise<BillView> {
    if (!isUuid(billId)) throw notFound();
    const [row] = await this.db
      .select()
      .from(bills)
      .where(and(eq(bills.restaurantId, tenant), eq(bills.id, billId)))
      .limit(1);
    if (!row) throw notFound();
    return toBillView(row);
  }

  /** Cashier screen: every open session with what it owes and its current bill. */
  async overview(tenant: TenantId): Promise<CashierOverview> {
    const [restaurant] = await this.db
      .select({
        bankBin: restaurants.bankBin,
        bankChangedAt: restaurants.bankChangedAt,
        rules: restaurants.rules,
      })
      .from(restaurants)
      .where(eq(restaurants.id, tenant))
      .limit(1);
    if (!restaurant) throw notFound();
    const sessions = await this.db
      .select({
        id: tableSessions.id,
        partySize: tableSessions.partySize,
        openedAt: tableSessions.openedAt,
        tableName: diningTables.name,
      })
      .from(tableSessions)
      .innerJoin(
        diningTables,
        and(
          eq(diningTables.restaurantId, tableSessions.restaurantId),
          eq(diningTables.id, tableSessions.tableId),
        ),
      )
      .where(and(eq(tableSessions.restaurantId, tenant), eq(tableSessions.status, 'open')))
      .orderBy(asc(tableSessions.openedAt), asc(tableSessions.id))
      .limit(OVERVIEW_MAX);
    const ids = sessions.map((session) => session.id);
    const totals = new Map<string, number>();
    const paid = new Map<string, number>();
    const latest = new Map<string, BillRow & PaidBy>();
    if (ids.length > 0) {
      const totalRows = await this.db
        .select({
          sessionId: orderItems.sessionId,
          total: sql<string>`coalesce(sum(${orderItems.priceVnd}::bigint * ${orderItems.quantity}), 0)`,
        })
        .from(orderItems)
        .innerJoin(
          orders,
          and(eq(orders.restaurantId, orderItems.restaurantId), eq(orders.id, orderItems.orderId)),
        )
        .where(billableIn(tenant, ids))
        .groupBy(orderItems.sessionId);
      for (const row of totalRows) totals.set(row.sessionId, Number(row.total));
      const billRows = await this.db
        .select({
          bill: bills,
          paidByName: users.displayName,
          paidByEmail: users.email,
          paidByRole: users.role,
        })
        .from(bills)
        .leftJoin(users, eq(users.id, bills.paidBy))
        .where(and(eq(bills.restaurantId, tenant), inArray(bills.sessionId, ids)))
        .orderBy(desc(sql`${bills.status} = 'open'`), desc(bills.createdAt));
      for (const { bill, paidByName, paidByEmail, paidByRole } of billRows) {
        if (bill.status === 'paid') {
          paid.set(bill.sessionId, (paid.get(bill.sessionId) ?? 0) + bill.amountVnd);
        }
        if (!latest.has(bill.sessionId)) {
          latest.set(bill.sessionId, {
            ...bill,
            paidByName: payerName(paidByName, paidByEmail, paidByRole),
          });
        }
      }
    }
    return {
      sessions: sessions.map((session) => {
        const totalVnd = totals.get(session.id) ?? 0;
        const paidVnd = paid.get(session.id) ?? 0;
        const bill = latest.get(session.id);
        return {
          sessionId: session.id,
          tableName: session.tableName,
          partySize: session.partySize,
          openedAt: session.openedAt.toISOString(),
          totalVnd,
          paidVnd,
          dueVnd: amountDue(totalVnd, paidVnd),
          bill: bill ? { ...toBillView(bill), paidByName: bill.paidByName } : null,
        };
      }),
      bankConfigured: restaurant.bankBin !== null,
      qrEnabled: qrPaymentActive(readStoredRules(restaurant.rules), restaurant.bankBin !== null),
      bankChangedAt: restaurant.bankChangedAt?.toISOString() ?? null,
      bankChangedRecently: isBankChangeRecent(restaurant.bankChangedAt, this.clock.now()),
    };
  }

  private async lockSession(
    tx: Executor,
    tenant: TenantId,
    sessionId: string,
  ): Promise<{ status: 'open' | 'closed'; tableId: string }> {
    const [session] = await tx
      .select({ status: tableSessions.status, tableId: tableSessions.tableId })
      .from(tableSessions)
      .where(and(eq(tableSessions.restaurantId, tenant), eq(tableSessions.id, sessionId)))
      .limit(1)
      .for('update');
    if (!session) throw notFound();
    return session;
  }

  /** Billable lines (same rule as `domain/totals.ts` `isBillable`), for display only. */
  private async lines(executor: Executor, tenant: TenantId, sessionId: string) {
    return executor
      .select({
        id: orderItems.id,
        name: orderItems.nameSnapshot,
        quantity: orderItems.quantity,
        priceVnd: orderItems.priceVnd,
      })
      .from(orderItems)
      .innerJoin(
        orders,
        and(eq(orders.restaurantId, orderItems.restaurantId), eq(orders.id, orderItems.orderId)),
      )
      .where(billableIn(tenant, [sessionId]))
      .orderBy(asc(orderItems.seq))
      .limit(LINES_MAX);
  }

  private async buildView(
    executor: Executor,
    tenant: TenantId,
    sessionId: string,
  ): Promise<SessionBillView> {
    const [head] = await executor
      .select({
        restaurantName: restaurants.name,
        rules: restaurants.rules,
        bankBin: restaurants.bankBin,
        bankAccount: restaurants.bankAccount,
        bankAccountName: restaurants.bankAccountName,
        tableName: diningTables.name,
        status: tableSessions.status,
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
      .where(and(eq(tableSessions.restaurantId, tenant), eq(tableSessions.id, sessionId)))
      .limit(1);
    if (!head) throw notFound();
    const { totalVnd, paidVnd, dueVnd } = await sessionAmounts(executor, tenant, sessionId);
    const lines = await this.lines(executor, tenant, sessionId);
    const [latest] = await executor
      .select()
      .from(bills)
      .where(and(eq(bills.restaurantId, tenant), eq(bills.sessionId, sessionId)))
      .orderBy(desc(sql`${bills.status} = 'open'`), desc(bills.createdAt))
      .limit(1);
    const stored =
      head.bankBin !== null && head.bankAccount !== null && head.bankAccountName !== null
        ? { bin: head.bankBin, account: head.bankAccount, name: head.bankAccountName }
        : null;
    // TQR-029: the restaurant's current choice, not an order's snapshot (it is how money is taken
    // now, not a rule an order is judged by). Off → never a VietQR payload, even with an account.
    const bank = qrPaymentActive(readStoredRules(head.rules), stored !== null) ? stored : null;
    let transfer: SessionBillView['transfer'] = null;
    let payAtCounter = bank === null;
    if (latest?.status === 'open' && bank) {
      try {
        transfer = {
          payload: buildVietQr({
            bin: bank.bin,
            accountNumber: bank.account,
            amountVnd: latest.amountVnd,
            memo: billMemo(latest.code),
          }),
          bankName: bankByBin(bank.bin)?.shortName ?? bank.bin,
          accountNumber: bank.account,
          accountName: bank.name,
        };
      } catch (error: unknown) {
        // A stored account banks would refuse: never fail the bill (or a committed payment) on it.
        if (!(error instanceof VietQrInputError)) throw error;
        this.logger.warn('vietqr_unbuildable', { restaurantId: tenant, field: error.field });
        payAtCounter = true;
      }
    }
    return {
      restaurantName: head.restaurantName,
      session: { id: sessionId, tableName: head.tableName, status: head.status },
      lines: lines.map((line) => ({
        id: line.id,
        name: line.name,
        quantity: line.quantity,
        priceVnd: line.priceVnd,
        lineTotalVnd: line.priceVnd * line.quantity,
      })),
      totalVnd,
      paidVnd,
      dueVnd,
      bill: latest ? toBillView(latest) : null,
      transfer,
      payAtCounter,
    };
  }
}
