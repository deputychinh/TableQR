import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { ErrorCode } from '../common/enums/error-code.enum.js';
import { DomainError } from '../common/errors/domain.error.js';
import type { TenantId } from '../common/tenant.js';
import type { Database } from '../db/database.module.js';
import { publish } from '../realtime/publisher.js';
import { orderItems, orders } from '../service/service.schema.js';
import { bills } from './billing.schema.js';
import { newBillCode } from './domain/bill-code.js';
import { BILLABLE_ORDER_STATUSES, amountDue, decideBill } from './domain/totals.js';

/** Any query runner: the database or a transaction. */
export type Executor = Pick<Database, 'select' | 'insert' | 'update' | 'delete' | 'execute'>;

export type BillRow = typeof bills.$inferSelect;

const CODE_ATTEMPTS = 8;

/** SQL form of `isBillable` (domain/totals.ts) for the given sessions of the tenant. */
export const billableIn = (tenant: TenantId, sessionIds: string[]) =>
  and(
    eq(orderItems.restaurantId, tenant),
    inArray(orderItems.sessionId, sessionIds),
    ne(orderItems.status, 'cancelled'),
    inArray(orders.status, [...BILLABLE_ORDER_STATUSES]),
  );

/** Total, paid and due in SQL over every billable line of a session (no display cap). */
export const sessionAmounts = async (executor: Executor, tenant: TenantId, sessionId: string) => {
  const [totalRow] = await executor
    .select({
      total: sql<string>`coalesce(sum(${orderItems.priceVnd}::bigint * ${orderItems.quantity}), 0)`,
    })
    .from(orderItems)
    .innerJoin(
      orders,
      and(eq(orders.restaurantId, orderItems.restaurantId), eq(orders.id, orderItems.orderId)),
    )
    .where(billableIn(tenant, [sessionId]));
  const [paidRow] = await executor
    .select({ paid: sql<string>`coalesce(sum(${bills.amountVnd}), 0)` })
    .from(bills)
    .where(
      and(eq(bills.restaurantId, tenant), eq(bills.sessionId, sessionId), eq(bills.status, 'paid')),
    );
  const totalVnd = Number(totalRow?.total ?? 0);
  const paidVnd = Number(paidRow?.paid ?? 0);
  return { totalVnd, paidVnd, dueVnd: amountDue(totalVnd, paidVnd) };
};

/** `bill.status` on the guest's session and the floor (ADR 0004), inside the caller's transaction. */
export const publishBill = async (
  tx: Executor,
  tenant: TenantId,
  sessionId: string,
  bill: BillRow,
): Promise<void> => {
  const data = {
    billId: bill.id,
    sessionId,
    code: bill.code,
    status: bill.status,
    amountVnd: bill.amountVnd,
  };
  for (const topic of [`session:${sessionId}`, 'floor']) {
    await publish(tx, { restaurantId: tenant, topic, type: 'bill.status', data });
  }
};

/** Inserts an open bill with a fresh code; a code clash in the restaurant draws another. */
const issueBill = async (
  tx: Executor,
  tenant: TenantId,
  sessionId: string,
  amountVnd: number,
  now: Date,
): Promise<BillRow> => {
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const [row] = await tx
      .insert(bills)
      .values({ restaurantId: tenant, sessionId, code: newBillCode(), amountVnd, createdAt: now })
      .onConflictDoNothing({ target: [bills.restaurantId, bills.code] })
      .returning();
    if (row) return row;
  }
  throw new DomainError(ErrorCode.Internal, 500);
};

export interface SyncOptions {
  /** Issue a bill when none is open (the guest or staff asked for it, or a payment left a rest). */
  issueWhenNone: boolean;
}

/** True when the session already paid a bill (the guest is in the billing flow). */
const hasPaidBill = async (tx: Executor, tenant: TenantId, sessionId: string): Promise<boolean> => {
  const [row] = await tx
    .select({ id: bills.id })
    .from(bills)
    .where(
      and(eq(bills.restaurantId, tenant), eq(bills.sessionId, sessionId), eq(bills.status, 'paid')),
    )
    .limit(1);
  return row !== undefined;
};

/**
 * AC42: keeps a session's open bill equal to what it owes now. Same amount → the code on screen
 * stays; a different amount → the open bill becomes `superseded` and a new code is issued; nothing
 * due → no open bill. Without an open bill nothing happens unless `issueWhenNone` or the session already paid a bill. Runs inside the
 * caller's transaction with the session row locked, and publishes every change (`bill.status`).
 *
 * Called wherever billable items change: a bill request, an order released or put to payment at
 * placement, a held order accepted (waiter or AC20), and after a payment released orders.
 */
export const syncOpenBill = async (
  tx: Executor,
  tenant: TenantId,
  sessionId: string,
  now: Date,
  options: SyncOptions,
): Promise<void> => {
  const [open] = await tx
    .select()
    .from(bills)
    .where(
      and(eq(bills.restaurantId, tenant), eq(bills.sessionId, sessionId), eq(bills.status, 'open')),
    )
    .limit(1);
  // Without an open bill, issue one only when asked to — or when the table already paid a bill:
  // the guest is in the billing flow, and a page left open must show what is now due (AC42).
  if (!open && !options.issueWhenNone && !(await hasPaidBill(tx, tenant, sessionId))) return;
  const { dueVnd } = await sessionAmounts(tx, tenant, sessionId);
  const decision = decideBill(dueVnd, open?.amountVnd ?? null);
  if (decision.supersede && open) {
    await tx
      .update(bills)
      .set({ status: 'superseded' })
      .where(and(eq(bills.restaurantId, tenant), eq(bills.id, open.id), eq(bills.status, 'open')));
    await publishBill(tx, tenant, sessionId, { ...open, status: 'superseded' });
  }
  if (decision.issue) {
    await publishBill(tx, tenant, sessionId, await issueBill(tx, tenant, sessionId, dueVnd, now));
  }
};
