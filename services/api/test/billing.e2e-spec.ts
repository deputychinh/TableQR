import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { DB, type Database } from '../src/db/database.module.js';
import { bills, orderItems, orders, tableSessions } from '../src/db/schema.js';
import { decodeVietQr } from '../src/billing/domain/vietqr.js';
import type { RealtimeEvent } from '../src/realtime/domain/event.js';
import { RealtimeHub } from '../src/realtime/realtime.hub.js';
import { DEFAULT_RULES } from '../src/settings/domain/house-rules.js';
import { createTestApp, type TestApp } from './support/app.js';
import {
  addOrder,
  openSession,
  seedMenu,
  type FloorFixture,
  type SessionFixture,
} from './support/floor.js';
import { ORIGIN, OWNER_PASSWORD, signUp } from './support/http.js';
import { openSse, type SseClient } from './support/sse.js';
import { STAFF_PASSWORD, addStaff, loginCookie } from './support/staff.js';

const BANK = { bin: '970436', accountNumber: '0123456789', accountName: 'NGUYEN VAN ANH' };
/** These journeys pay by VietQR: the option is off by default since TQR-029. */
const QR_RULES = { ...DEFAULT_RULES, payment: { qrEnabled: true } };

interface Restaurant {
  id: string;
  owner: string;
  cashier: string;
  cashier2: string;
  cashierId: string;
  cashierEmail: string;
  waiter: string;
  kitchen: string;
  floor: FloorFixture;
}

describe('billing (e2e, real Postgres): S12 bill + VietQR, S13 cashier', () => {
  let t: TestApp;
  let db: Database;
  let hub: RealtimeHub;
  let base: string;
  let a: Restaurant;
  let b: Restaurant;
  const clients: SseClient[] = [];

  const http = () => request(t.app.getHttpServer());
  const post = (path: string, cookie: string, body?: object) =>
    http().post(path).set('origin', ORIGIN).set('cookie', cookie).send(body);

  const setBank = (owner: string, bank: typeof BANK | null) =>
    http()
      .put('/api/restaurant/settings')
      .set('origin', ORIGIN)
      .set('cookie', owner)
      .send({
        rules: bank === null ? DEFAULT_RULES : QR_RULES,
        bank,
        currentPassword: OWNER_PASSWORD,
      })
      .expect(200);

  const restaurant = async (withBank: boolean): Promise<Restaurant> => {
    const owner = await signUp(t);
    const id = owner.response.body.restaurant.id as string;
    const cookieFor = async (role: 'cashier' | 'waiter' | 'kitchen') => {
      const { body, member } = await addStaff(t, owner.cookie, role);
      return {
        cookie: await loginCookie(t, body.email, STAFF_PASSWORD),
        id: member.id,
        email: body.email,
      };
    };
    const cashier = await cookieFor('cashier');
    if (withBank) await setBank(owner.cookie, BANK);
    return {
      id,
      owner: owner.cookie,
      cashier: cashier.cookie,
      cashierId: cashier.id,
      cashierEmail: cashier.email,
      cashier2: (await cookieFor('cashier')).cookie,
      waiter: (await cookieFor('waiter')).cookie,
      kitchen: (await cookieFor('kitchen')).cookie,
      floor: await seedMenu(db, id),
    };
  };

  const guestBill = (session: SessionFixture) =>
    post('/api/g/bill', session.guestCookie).expect(200);

  /** Events published for a restaurant while `run` executes (committed only, ADR 0004). */
  const captureEvents = (restaurantId: string, topics: string[]) => {
    const events: RealtimeEvent[] = [];
    const stop = hub.subscribe(restaurantId, topics, (event) => {
      if (event !== 'resync' && event !== 'revoked') events.push(event);
    });
    return { events, stop };
  };

  beforeAll(async () => {
    t = await createTestApp();
    await t.app.listen(0, '127.0.0.1');
    const server = t.app.getHttpServer() as unknown as { address: () => AddressInfo };
    base = `http://127.0.0.1:${String(server.address().port)}`;
    db = t.app.get(DB);
    hub = t.app.get(RealtimeHub);
    a = await restaurant(true);
    b = await restaurant(true);
  });

  afterEach(() => {
    for (const client of clients.splice(0)) client.close();
  });

  afterAll(async () => {
    await t.app.close();
  });

  describe('S12 bill with VietQR', () => {
    it('AC40/AC43: the guest gets every non-cancelled item, the total and a VietQR that decodes to the bank, amount and memo', async () => {
      const session = await openSession(db, a.floor);
      await addOrder(db, a.floor, session, 'released', [
        { name: 'Phở bò', priceVnd: 50_000, quantity: 2 },
        { name: 'Trà đá', priceVnd: 5_000, quantity: 3 },
        { name: 'Nem rán', priceVnd: 40_000, quantity: 1, status: 'cancelled' },
      ]);
      await addOrder(db, a.floor, session, 'held', [{ priceVnd: 90_000, quantity: 1 }]);
      await addOrder(db, a.floor, session, 'rejected', [
        { priceVnd: 70_000, quantity: 1, status: 'cancelled' },
      ]);

      const { body } = await guestBill(session);

      expect(body.lines.map((l: { name: string }) => l.name)).toEqual(['Phở bò', 'Trà đá']);
      expect(body).toMatchObject({ totalVnd: 115_000, paidVnd: 0, dueVnd: 115_000 });
      expect(body.bill).toMatchObject({ amountVnd: 115_000, status: 'open', method: null });
      expect(body.bill.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}$/);
      expect(body.bill.memo).toBe(`TQR ${body.bill.code as string}`);
      expect(body.transfer).toMatchObject({
        bankName: 'Vietcombank',
        accountNumber: BANK.accountNumber,
        accountName: BANK.accountName,
      });
      expect(decodeVietQr(body.transfer.payload as string)).toMatchObject({
        bin: BANK.bin,
        accountNumber: BANK.accountNumber,
        amountVnd: 115_000,
        memo: `TQR ${body.bill.code as string}`,
        initiation: 'dynamic',
        crcValid: true,
      });
      expect(body.payAtCounter).toBe(false);
      // GET shows the same bill without issuing another one.
      const again = await http().get('/api/g/bill').set('cookie', session.guestCookie).expect(200);
      expect(again.body.bill.id).toBe(body.bill.id);
    });

    it('AC40: staff (waiter too) can ask for a table’s bill', async () => {
      const session = await openSession(db, a.floor);
      await addOrder(db, a.floor, session, 'released', [{ priceVnd: 60_000, quantity: 1 }]);
      const { body } = await post('/api/bills', a.waiter, { sessionId: session.sessionId }).expect(
        200,
      );
      expect(body.bill).toMatchObject({ amountVnd: 60_000, status: 'open' });
      const view = await http()
        .get(`/api/sessions/${session.sessionId}/bill`)
        .set('cookie', a.cashier)
        .expect(200);
      expect(view.body.bill.id).toBe(body.bill.id);
    });

    it('AC41: without a bank account the bill has no QR and says pay at the counter', async () => {
      const c = await restaurant(false);
      const session = await openSession(db, c.floor);
      await addOrder(db, c.floor, session, 'released', [{ priceVnd: 45_000, quantity: 2 }]);
      const { body } = await guestBill(session);
      expect(body.bill).toMatchObject({ amountVnd: 90_000, status: 'open' });
      expect(body.transfer).toBeNull();
      expect(body.payAtCounter).toBe(true);
    });

    it('AC42: the same amount keeps the code; an item added after the bill gives a new code and the old one is superseded', async () => {
      const session = await openSession(db, a.floor);
      await addOrder(db, a.floor, session, 'released', [{ priceVnd: 50_000, quantity: 1 }]);
      const first = (await guestBill(session)).body;
      const repeat = (await guestBill(session)).body;
      expect(repeat.bill.code).toBe(first.bill.code);

      await addOrder(db, a.floor, session, 'released', [{ priceVnd: 30_000, quantity: 1 }]);
      const second = (await guestBill(session)).body;
      expect(second.bill.code).not.toBe(first.bill.code);
      expect(second.bill.amountVnd).toBe(80_000);
      expect(decodeVietQr(second.transfer.payload as string).amountVnd).toBe(80_000);

      const old = await http()
        .get(`/api/bills/${first.bill.id as string}`)
        .set('cookie', a.cashier)
        .expect(200);
      expect(old.body.status).toBe('superseded');
      const paid = await post(`/api/bills/${first.bill.id as string}/pay`, a.cashier, {
        method: 'transfer',
      }).expect(409);
      expect(paid.body.code).toBe('BILL_SUPERSEDED');
      expect(paid.body.detail).toBe('Hoá đơn đã thay đổi');
      const open = await db
        .select({ id: bills.id })
        .from(bills)
        .where(and(eq(bills.sessionId, session.sessionId), eq(bills.status, 'open')));
      expect(open).toHaveLength(1);
    });

    it('AC42 boundary: cancelling everything after the bill leaves no payable bill', async () => {
      const session = await openSession(db, a.floor);
      const order = await addOrder(db, a.floor, session, 'released', [
        { priceVnd: 20_000, quantity: 1 },
      ]);
      const first = (await guestBill(session)).body;
      await db
        .update(orderItems)
        .set({ status: 'cancelled' })
        .where(eq(orderItems.orderId, order.orderId));
      const after = (await guestBill(session)).body;
      expect(after.dueVnd).toBe(0);
      expect(after.bill).toMatchObject({ id: first.bill.id, status: 'superseded' });
      expect(after.transfer).toBeNull();
    });

    it('a session with nothing ordered has no bill yet', async () => {
      const session = await openSession(db, a.floor);
      const { body } = await guestBill(session);
      expect(body).toMatchObject({ bill: null, totalVnd: 0, dueVnd: 0, transfer: null, lines: [] });
    });

    it('guests need the table cookie: none, unknown or another restaurant’s suspended session → 401', async () => {
      const none = await http().get('/api/g/bill').expect(401);
      expect(none.body.code).toBe('GUEST_SESSION_REQUIRED');
      await http().get('/api/g/bill').set('cookie', 'tqr_guest=not-a-real-token').expect(401);
      await http().post('/api/g/bill').set('origin', ORIGIN).expect(401);
      await http().get('/api/g/bill/stream').expect(401);
    });
  });

  describe('AC42 live: an open bill follows the items released after it', () => {
    /** A restaurant with a bank account and the given rules, for the rule-specific cases. */
    const withRules = async (patch: Partial<typeof DEFAULT_RULES>): Promise<Restaurant> => {
      const r = await restaurant(true);
      await http()
        .put('/api/restaurant/settings')
        .set('origin', ORIGIN)
        .set('cookie', r.owner)
        .send({
          rules: { ...QR_RULES, ...patch },
          bank: BANK,
          currentPassword: OWNER_PASSWORD,
        })
        .expect(200);
      return r;
    };
    const guestOrder = (r: Restaurant, session: SessionFixture, quantity = 1) =>
      http()
        .post('/api/g/orders')
        .set('origin', ORIGIN)
        .set('cookie', session.guestCookie)
        .set('idempotency-key', randomUUID())
        .send({ lines: [{ menuItemId: r.floor.menuItemId, quantity, priceVnd: 50_000 }] });
    const openBillStream = async (session: SessionFixture) => {
      const stream = await openSse(`${base}/api/g/bill/stream`, session.guestCookie);
      clients.push(stream);
      await stream.waitFor((m) => m.event === 'snapshot');
      return stream;
    };
    const billEvent = (stream: SseClient, status: string, billId?: string) =>
      stream.waitFor(
        (m) =>
          m.event === 'delta' &&
          m.data.type === 'bill.status' &&
          m.data.status === status &&
          (billId === undefined || m.data.billId === billId),
      );

    it('a guest order released after the bill supersedes it in the same transaction: the open page gets the new code, amount and QR', async () => {
      const session = await openSession(db, a.floor);
      await addOrder(db, a.floor, session, 'released', [{ priceVnd: 50_000, quantity: 1 }]);
      const first = (await guestBill(session)).body.bill as { id: string; code: string };
      const stream = await openBillStream(session);

      await guestOrder(a, session).expect(201);

      const superseded = await billEvent(stream, 'superseded', first.id);
      expect(superseded.data).toMatchObject({ code: first.code, amountVnd: 50_000 });
      const issued = await billEvent(stream, 'open');
      expect(issued.data.amountVnd).toBe(100_000);
      expect(issued.data.code).not.toBe(first.code);
      // No new request needed: the bill as it stands already carries the new code and QR.
      const view = (await http().get('/api/g/bill').set('cookie', session.guestCookie).expect(200))
        .body;
      expect(view.bill).toMatchObject({
        id: issued.data.billId,
        status: 'open',
        amountVnd: 100_000,
      });
      expect(decodeVietQr(view.transfer.payload as string)).toMatchObject({
        amountVnd: 100_000,
        memo: `TQR ${issued.data.code as string}`,
      });
      const old = await post(`/api/bills/${first.id}/pay`, a.cashier, { method: 'cash' }).expect(
        409,
      );
      expect(old.body.code).toBe('BILL_SUPERSEDED');
    });

    it('a held order is not billed; the waiter confirming it supersedes the open bill', async () => {
      const r = await withRules({ orderApproval: 'every_order' });
      const session = await openSession(db, r.floor);
      await addOrder(db, r.floor, session, 'released', [{ priceVnd: 50_000, quantity: 1 }]);
      const first = (await guestBill(session)).body.bill as { id: string };
      const stream = await openBillStream(session);
      const held = await guestOrder(r, session).expect(201);
      expect(held.body.status).toBe('held');
      const [stillOpen] = await db.select().from(bills).where(eq(bills.id, first.id));
      expect(stillOpen?.status).toBe('open');

      await post(`/api/orders/${held.body.id as string}/confirm`, r.waiter).expect(200);

      await billEvent(stream, 'superseded', first.id);
      expect((await billEvent(stream, 'open')).data.amountVnd).toBe(100_000);
    });

    it('pay before cooking: a second order supersedes the bill; paying the new one releases both and the order cards turn "released" live', async () => {
      const r = await withRules({ paymentTiming: 'pay_before' });
      const session = await openSession(db, r.floor);
      const one = await guestOrder(r, session).expect(201);
      expect(one.body.status).toBe('awaiting_payment');
      const first = (await guestBill(session)).body.bill as { id: string };
      const billStream = await openBillStream(session);
      const orderStream = await openSse(`${base}/api/g/stream`, session.guestCookie);
      clients.push(orderStream);
      await orderStream.waitFor((m) => m.event === 'snapshot');
      const two = await guestOrder(r, session).expect(201);
      await billEvent(billStream, 'superseded', first.id);
      const issued = await billEvent(billStream, 'open');
      expect(issued.data.amountVnd).toBe(100_000);

      await post(`/api/bills/${issued.data.billId as string}/pay`, r.cashier, {
        method: 'transfer',
      }).expect(200);

      for (const order of [one.body.id, two.body.id]) {
        await orderStream.waitFor(
          (m) =>
            m.event === 'delta' &&
            m.data.type === 'order.status' &&
            m.data.orderId === order &&
            m.data.status === 'released',
        );
      }
      const rows = await db.select().from(orders).where(eq(orders.sessionId, session.sessionId));
      expect(rows.map((row) => row.status)).toEqual(['released', 'released']);
    });

    it('a payment that covers only part of what is due issues a bill for the rest, live on the guest page', async () => {
      const session = await openSession(db, a.floor);
      const older = await addOrder(
        db,
        a.floor,
        session,
        'awaiting_payment',
        [{ priceVnd: 40_000, quantity: 1 }],
        new Date(t.clock.now().getTime() - 60_000),
      );
      const bill = (await guestBill(session)).body.bill as { id: string };
      // An order recorded after the bill without going through the bill (seeded straight in).
      const later = await addOrder(
        db,
        a.floor,
        session,
        'awaiting_payment',
        [{ priceVnd: 15_000, quantity: 1 }],
        new Date(t.clock.now().getTime() + 60_000),
      );
      const stream = await openBillStream(session);

      const paid = await post(`/api/bills/${bill.id}/pay`, a.cashier, { method: 'cash' }).expect(
        200,
      );

      expect(paid.body).toMatchObject({ paidVnd: 40_000, dueVnd: 15_000 });
      expect(paid.body.bill).toMatchObject({ status: 'open', amountVnd: 15_000 });
      expect((await billEvent(stream, 'open')).data.amountVnd).toBe(15_000);
      const [o1] = await db.select().from(orders).where(eq(orders.id, older.orderId));
      const [o2] = await db.select().from(orders).where(eq(orders.id, later.orderId));
      expect([o1?.status, o2?.status]).toEqual(['released', 'awaiting_payment']);
    });

    it('after a bill is paid in full, a new order issues a bill for the new amount, live on the open page (no dead end)', async () => {
      const session = await openSession(db, a.floor);
      await addOrder(db, a.floor, session, 'released', [{ priceVnd: 50_000, quantity: 1 }]);
      const first = (await guestBill(session)).body.bill as { id: string };
      await post(`/api/bills/${first.id}/pay`, a.cashier, { method: 'cash' }).expect(200);
      const stream = await openBillStream(session);

      await guestOrder(a, session).expect(201);

      const issued = await billEvent(stream, 'open');
      expect(issued.data.amountVnd).toBe(50_000);
      const after = await guestBill(session);
      expect(after.body).toMatchObject({ paidVnd: 50_000, dueVnd: 50_000 });
      expect(after.body.bill).toMatchObject({ status: 'open', amountVnd: 50_000 });
      expect(after.body.bill.id).not.toBe(first.id);
    });

    it('a session that never asked for a bill gets none issued by new orders', async () => {
      const session = await openSession(db, a.floor);
      await guestOrder(a, session).expect(201);
      const [row] = await db.select().from(bills).where(eq(bills.sessionId, session.sessionId));
      expect(row).toBeUndefined();
    });

    describe('TQR-025 the kitchen cancels an item ("Huỷ món")', () => {
      const cancel = (r: Restaurant, itemId: string, version = 1) =>
        post(`/api/kitchen/items/${itemId}/cancel`, r.kitchen, { version });
      const billsOf = (sessionId: string) =>
        db
          .select({ status: bills.status, amountVnd: bills.amountVnd })
          .from(bills)
          .where(eq(bills.sessionId, sessionId));

      it('supersedes the open bill with one for the new amount in the same transaction; the open bill page and the item hear it live', async () => {
        const session = await openSession(db, a.floor);
        const { itemIds } = await addOrder(db, a.floor, session, 'released', [
          { name: 'Phở bò', priceVnd: 50_000, quantity: 1 },
          { name: 'Nem rán', priceVnd: 40_000, quantity: 1 },
        ]);
        const first = (await guestBill(session)).body.bill as { id: string; code: string };
        const stream = await openBillStream(session);
        const captured = captureEvents(a.id, [`session:${session.sessionId}`]);

        const response = await cancel(a, itemIds[1] ?? '').expect(200);
        expect(response.body).toMatchObject({ status: 'cancelled', version: 2 });

        const superseded = await billEvent(stream, 'superseded', first.id);
        expect(superseded.data).toMatchObject({ code: first.code, amountVnd: 90_000 });
        const issued = await billEvent(stream, 'open');
        expect(issued.data.amountVnd).toBe(50_000);
        expect(issued.data.code).not.toBe(first.code);
        const view = (
          await http().get('/api/g/bill').set('cookie', session.guestCookie).expect(200)
        ).body;
        expect(view).toMatchObject({ totalVnd: 50_000, dueVnd: 50_000 });
        expect(view.bill).toMatchObject({ id: issued.data.billId, amountVnd: 50_000 });
        expect(decodeVietQr(view.transfer.payload as string).amountVnd).toBe(50_000);
        expect(view.lines.map((l: { name: string }) => l.name)).toEqual(['Phở bò']);
        await vi.waitFor(() =>
          expect(captured.events).toContainEqual(
            expect.objectContaining({
              type: 'item.status',
              data: expect.objectContaining({ itemId: itemIds[1], status: 'cancelled' }),
            }),
          ),
        );
        captured.stop();
        expect(await billsOf(session.sessionId)).toEqual(
          expect.arrayContaining([
            { status: 'superseded', amountVnd: 90_000 },
            { status: 'open', amountVnd: 50_000 },
          ]),
        );
      });

      it('when nothing is due any more the open bill is superseded and no new bill is issued', async () => {
        const session = await openSession(db, a.floor);
        const { itemIds } = await addOrder(db, a.floor, session, 'released', [
          { priceVnd: 30_000, quantity: 1 },
        ]);
        const first = (await guestBill(session)).body.bill as { id: string };
        const stream = await openBillStream(session);

        await cancel(a, itemIds[0] ?? '').expect(200);

        await billEvent(stream, 'superseded', first.id);
        expect(await billsOf(session.sessionId)).toEqual([
          { status: 'superseded', amountVnd: 30_000 },
        ]);
        const view = (
          await http().get('/api/g/bill').set('cookie', session.guestCookie).expect(200)
        ).body;
        expect(view).toMatchObject({ dueVnd: 0, transfer: null });
        expect(view.bill).toMatchObject({ id: first.id, status: 'superseded' });
      });

      it('issues no bill when the table never asked for one, and cancels a dish already cooking', async () => {
        const session = await openSession(db, a.floor);
        const { itemIds } = await addOrder(db, a.floor, session, 'released', [
          { priceVnd: 30_000, quantity: 1, status: 'cooking' },
          { priceVnd: 20_000, quantity: 1 },
        ]);
        await cancel(a, itemIds[0] ?? '').expect(200);
        expect(await billsOf(session.sessionId)).toEqual([]);
      });

      it('refuses a dish that left the kitchen (409 INVALID_TRANSITION) or a stale screen (409 STALE_VERSION); the bill stays', async () => {
        const session = await openSession(db, a.floor);
        const { itemIds } = await addOrder(db, a.floor, session, 'released', [
          { priceVnd: 30_000, quantity: 1, status: 'done' },
          { priceVnd: 20_000, quantity: 1 },
        ]);
        const first = (await guestBill(session)).body.bill as { id: string };
        const done = await cancel(a, itemIds[0] ?? '').expect(409);
        expect(done.body.code).toBe('INVALID_TRANSITION');
        const stale = await cancel(a, itemIds[1] ?? '', 5).expect(409);
        expect(stale.body.code).toBe('STALE_VERSION');
        expect(await billsOf(session.sessionId)).toEqual([{ status: 'open', amountVnd: 50_000 }]);
        const view = (
          await http().get('/api/g/bill').set('cookie', session.guestCookie).expect(200)
        ).body;
        expect(view.bill.id).toBe(first.id);
      });

      it('a waiter or cashier cannot cancel (403); another restaurant’s cook gets 404 and nothing changes', async () => {
        const session = await openSession(db, a.floor);
        const { itemIds } = await addOrder(db, a.floor, session, 'released', [
          { priceVnd: 30_000, quantity: 1 },
        ]);
        const id = itemIds[0] ?? '';
        await post(`/api/kitchen/items/${id}/cancel`, a.waiter, { version: 1 }).expect(403);
        await post(`/api/kitchen/items/${id}/cancel`, a.cashier, { version: 1 }).expect(403);
        await post(`/api/kitchen/items/${id}/cancel`, b.kitchen, { version: 1 }).expect(404);
        const [item] = await db
          .select({ status: orderItems.status })
          .from(orderItems)
          .where(eq(orderItems.id, id));
        expect(item?.status).toBe('waiting');
      });
    });
  });

  describe('S13 cashier confirms, closes, pay before cooking', () => {
    it('AC44: the cashier confirms a transfer; who, when, method and amount are recorded and the guest sees it live', async () => {
      const session = await openSession(db, a.floor);
      await addOrder(db, a.floor, session, 'released', [{ priceVnd: 75_000, quantity: 2 }]);
      const bill = (await guestBill(session)).body.bill as { id: string; code: string };
      const guestStream = await openSse(`${base}/api/g/bill/stream`, session.guestCookie);
      clients.push(guestStream);
      const snapshot = await guestStream.waitFor((m) => m.event === 'snapshot');
      expect((snapshot.data.bill as { status: string }).status).toBe('open');

      const before = t.clock.now();
      const { body } = await post(`/api/bills/${bill.id}/pay`, a.cashier, {
        method: 'transfer',
      }).expect(200);

      expect(body.bill).toMatchObject({ id: bill.id, status: 'paid', method: 'transfer' });
      expect(body).toMatchObject({ paidVnd: 150_000, dueVnd: 0, transfer: null });
      const delta = await guestStream.waitFor(
        (m) => m.event === 'delta' && m.data.type === 'bill.status',
      );
      expect(delta.data).toMatchObject({ billId: bill.id, status: 'paid', code: bill.code });

      const [row] = await db.select().from(bills).where(eq(bills.id, bill.id));
      expect(row).toMatchObject({
        status: 'paid',
        method: 'transfer',
        paidBy: a.cashierId,
        amountVnd: 150_000,
      });
      expect(row?.paidAt?.getTime()).toBeGreaterThanOrEqual(before.getTime() - 5);
      const audit = t.logs.find((l) => l.msg === 'bill_paid' && l.billId === bill.id);
      expect(audit).toMatchObject({
        byUserId: a.cashierId,
        method: 'transfer',
        amountVnd: 150_000,
        restaurantId: a.id,
      });

      const guest = await http().get('/api/g/bill').set('cookie', session.guestCookie).expect(200);
      expect(guest.body.bill.status).toBe('paid');
      const overview = await http().get('/api/bills/overview').set('cookie', a.owner).expect(200);
      const card = overview.body.sessions.find(
        (s: { sessionId: string }) => s.sessionId === session.sessionId,
      );
      expect(card).toMatchObject({ totalVnd: 150_000, paidVnd: 150_000, dueVnd: 0 });
      expect(card.bill).toMatchObject({
        status: 'paid',
        paidByName: 'Nhân viên cashier',
      });
    });

    it('AC44: the owner can take cash', async () => {
      const session = await openSession(db, a.floor);
      await addOrder(db, a.floor, session, 'released', [{ priceVnd: 10_000, quantity: 1 }]);
      const bill = (await guestBill(session)).body.bill as { id: string };
      const { body } = await post(`/api/bills/${bill.id}/pay`, a.owner, { method: 'cash' }).expect(
        200,
      );
      expect(body.bill).toMatchObject({ status: 'paid', method: 'cash' });
      // TQR-019: an owner without a display name is named by role (the screen says "Chủ quán").
      const overview = await http().get('/api/bills/overview').set('cookie', a.owner).expect(200);
      const card = overview.body.sessions.find(
        (s: { sessionId: string }) => s.sessionId === session.sessionId,
      );
      expect(card.bill).toMatchObject({ paidByName: 'Chủ quán' });
    });

    it('AC45: a second confirmation is refused with 409 ALREADY_PAID', async () => {
      const session = await openSession(db, a.floor);
      await addOrder(db, a.floor, session, 'released', [{ priceVnd: 10_000, quantity: 1 }]);
      const bill = (await guestBill(session)).body.bill as { id: string };
      await post(`/api/bills/${bill.id}/pay`, a.cashier, { method: 'cash' }).expect(200);
      const second = await post(`/api/bills/${bill.id}/pay`, a.cashier, {
        method: 'transfer',
      }).expect(409);
      expect(second.body.code).toBe('ALREADY_PAID');
      const [row] = await db.select().from(bills).where(eq(bills.id, bill.id));
      expect(row?.method).toBe('cash');
    });

    it('AC45 concurrency: two cashiers confirm the same bill at once → exactly one 200 and one 409', async () => {
      for (let round = 0; round < 5; round += 1) {
        const session = await openSession(db, a.floor);
        await addOrder(db, a.floor, session, 'released', [{ priceVnd: 10_000, quantity: 1 }]);
        const bill = (await guestBill(session)).body.bill as { id: string };
        const results = await Promise.all([
          post(`/api/bills/${bill.id}/pay`, a.cashier, { method: 'transfer' }),
          post(`/api/bills/${bill.id}/pay`, a.cashier2, { method: 'cash' }),
        ]);
        expect(results.map((r) => r.status).sort((x, y) => x - y)).toEqual([200, 409]);
        expect(results.find((r) => r.status === 409)?.body.code).toBe('ALREADY_PAID');
      }
    });

    it('after paying, more food gives a new bill for the rest only', async () => {
      const session = await openSession(db, a.floor);
      await addOrder(db, a.floor, session, 'released', [{ priceVnd: 10_000, quantity: 1 }]);
      const first = (await guestBill(session)).body.bill as { id: string; code: string };
      await post(`/api/bills/${first.id}/pay`, a.cashier, { method: 'cash' }).expect(200);
      expect((await guestBill(session)).body.bill).toMatchObject({ id: first.id, status: 'paid' });
      await addOrder(db, a.floor, session, 'released', [{ priceVnd: 25_000, quantity: 1 }]);
      const next = (await guestBill(session)).body;
      expect(next).toMatchObject({ totalVnd: 35_000, paidVnd: 10_000, dueVnd: 25_000 });
      expect(next.bill).toMatchObject({ amountVnd: 25_000, status: 'open' });
      expect(next.bill.code).not.toBe(first.code);
    });

    it('AC46: closing a paid session frees the table and signs the guest phones out', async () => {
      const session = await openSession(db, a.floor);
      await addOrder(db, a.floor, session, 'released', [{ priceVnd: 10_000, quantity: 1 }]);
      const bill = (await guestBill(session)).body.bill as { id: string };
      await post(`/api/bills/${bill.id}/pay`, a.cashier, { method: 'cash' }).expect(200);
      const events = captureEvents(a.id, ['floor']);

      const { body } = await post(`/api/sessions/${session.sessionId}/close`, a.cashier, {}).expect(
        200,
      );

      expect(body).toEqual({ sessionId: session.sessionId, status: 'closed', closeReason: null });
      const [row] = await db
        .select()
        .from(tableSessions)
        .where(eq(tableSessions.id, session.sessionId));
      expect(row?.status).toBe('closed');
      expect(row?.closedAt).toBeInstanceOf(Date);
      // The table takes a new session (one open session per table index no longer blocks it).
      await db
        .insert(tableSessions)
        .values({ restaurantId: a.id, tableId: session.tableId, partySize: 3, openedBy: 'staff' });
      await http().get('/api/g/bill').set('cookie', session.guestCookie).expect(401);
      const overview = await http().get('/api/bills/overview').set('cookie', a.cashier).expect(200);
      expect(
        overview.body.sessions.some(
          (s: { sessionId: string }) => s.sessionId === session.sessionId,
        ),
      ).toBe(false);
      await expect.poll(() => events.events.some((e) => e.type === 'session.status')).toBe(true);
      events.stop();
      const again = await post(`/api/sessions/${session.sessionId}/close`, a.cashier, {}).expect(
        409,
      );
      expect(again.body.code).toBe('SESSION_CLOSED');
      const late = await post('/api/bills', a.cashier, { sessionId: session.sessionId }).expect(
        409,
      );
      expect(late.body.code).toBe('SESSION_CLOSED');
    });

    it('AC47: closing an unpaid session needs a reason, which is stored', async () => {
      const session = await openSession(db, a.floor);
      await addOrder(db, a.floor, session, 'released', [{ priceVnd: 10_000, quantity: 1 }]);
      const refused = await post(`/api/sessions/${session.sessionId}/close`, a.cashier, {}).expect(
        422,
      );
      expect(refused.body).toMatchObject({ code: 'CLOSE_REASON_REQUIRED', dueVnd: 10_000 });
      expect(refused.body.fields).toEqual([{ path: 'reason', code: 'required' }]);
      await post(`/api/sessions/${session.sessionId}/close`, a.cashier, { reason: '   ' }).expect(
        422,
      );
      await post(`/api/sessions/${session.sessionId}/close`, a.cashier, {
        reason: 'x'.repeat(201),
      }).expect(422);

      const { body } = await post(`/api/sessions/${session.sessionId}/close`, a.cashier, {
        reason: 'Khách quen, trả sau',
      }).expect(200);

      expect(body.closeReason).toBe('Khách quen, trả sau');
      const [row] = await db
        .select()
        .from(tableSessions)
        .where(eq(tableSessions.id, session.sessionId));
      expect(row).toMatchObject({ status: 'closed', closeReason: 'Khách quen, trả sau' });
      expect(
        t.logs.find((l) => l.msg === 'session_closed' && l.sessionId === session.sessionId),
      ).toMatchObject({
        unpaidVnd: 10_000,
        withReason: true,
      });
      // The reason text itself never reaches the logs.
      expect(JSON.stringify(t.logs)).not.toContain('Khách quen');
    });

    it('AC13: a reused bill whose orders changed at the same amount still releases the new order once paid up', async () => {
      const session = await openSession(db, a.floor);
      const first = await addOrder(
        db,
        a.floor,
        session,
        'awaiting_payment',
        [{ priceVnd: 40_000, quantity: 1 }],
        new Date(Date.now() - 60_000),
      );
      const bill = (await guestBill(session)).body.bill as { id: string };
      await db.update(orders).set({ status: 'cancelled' }).where(eq(orders.id, first.orderId));
      await db
        .update(orderItems)
        .set({ status: 'cancelled' })
        .where(eq(orderItems.orderId, first.orderId));
      const second = await addOrder(
        db,
        a.floor,
        session,
        'awaiting_payment',
        [{ priceVnd: 40_000, quantity: 1 }],
        new Date(Date.now() + 60_000),
      );
      expect((await guestBill(session)).body.bill.id).toBe(bill.id);

      await post(`/api/bills/${bill.id}/pay`, a.cashier, { method: 'cash' }).expect(200);

      const [order] = await db.select().from(orders).where(eq(orders.id, second.orderId));
      expect(order?.status).toBe('released');
      const [item] = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, second.orderId));
      expect(item?.status).toBe('waiting');
    });

    it('closing supersedes the open bill and cancels unpaid pay-before orders; a late confirmation is refused', async () => {
      const session = await openSession(db, a.floor);
      const pending = await addOrder(db, a.floor, session, 'awaiting_payment', [
        { priceVnd: 40_000, quantity: 1 },
      ]);
      const held = await addOrder(db, a.floor, session, 'held', [
        { priceVnd: 10_000, quantity: 1 },
      ]);
      const bill = (await guestBill(session)).body.bill as { id: string };
      await post(`/api/sessions/${session.sessionId}/close`, a.cashier, {
        reason: 'Khách bỏ về',
      }).expect(200);

      const [row] = await db.select().from(bills).where(eq(bills.id, bill.id));
      expect(row?.status).toBe('superseded');
      for (const orderId of [pending.orderId, held.orderId]) {
        const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
        expect(order?.status).toBe('cancelled');
        const [item] = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
        expect(item?.status).toBe('cancelled');
      }
      const late = await post(`/api/bills/${bill.id}/pay`, a.cashier, { method: 'cash' }).expect(
        409,
      );
      expect(late.body.code).toBe('SESSION_CLOSED');
    });

    it('totals every billable line even when the session has more lines than the display cap', async () => {
      const session = await openSession(db, a.floor);
      await addOrder(
        db,
        a.floor,
        session,
        'released',
        Array.from({ length: 510 }, () => ({
          priceVnd: 1_000,
          quantity: 1,
          status: 'cancelled' as const,
        })),
      );
      await addOrder(db, a.floor, session, 'released', [{ priceVnd: 7_000, quantity: 2 }]);
      const { body } = await guestBill(session);
      expect(body).toMatchObject({ totalVnd: 14_000, dueVnd: 14_000 });
      expect(body.bill.amountVnd).toBe(14_000);
      expect(body.lines).toHaveLength(1);
    });

    it('a stored account banks would refuse shows "pay at the counter" instead of failing', async () => {
      const c = await restaurant(true);
      const { restaurants } = await import('../src/db/schema.js');
      await db
        .update(restaurants)
        .set({ bankAccount: 'not valid!' })
        .where(eq(restaurants.id, c.id));
      const session = await openSession(db, c.floor);
      await addOrder(db, c.floor, session, 'released', [{ priceVnd: 10_000, quantity: 1 }]);
      const { body } = await guestBill(session);
      expect(body).toMatchObject({ transfer: null, payAtCounter: true });
      await post(`/api/bills/${body.bill.id as string}/pay`, c.cashier, { method: 'cash' }).expect(
        200,
      );
      expect(t.logs.some((l) => l.msg === 'vietqr_unbuildable' && l.restaurantId === c.id)).toBe(
        true,
      );
    });

    it('AC13: confirming payment releases pay-before orders the bill covered, queue_at = confirmation time, and publishes item.status', async () => {
      const session = await openSession(db, a.floor);
      const covered = await addOrder(
        db,
        a.floor,
        session,
        'awaiting_payment',
        [
          { priceVnd: 50_000, quantity: 1 },
          { priceVnd: 5_000, quantity: 2 },
        ],
        new Date(Date.now() - 60_000),
      );
      const bill = (await guestBill(session)).body.bill as { id: string; amountVnd: number };
      expect(bill.amountVnd).toBe(60_000);
      // An order placed after the bill was issued is not paid for by it.
      const later = await addOrder(
        db,
        a.floor,
        session,
        'awaiting_payment',
        [{ priceVnd: 30_000, quantity: 1 }],
        new Date(Date.now() + 10_000),
      );
      const events = captureEvents(a.id, [
        `station:${a.floor.stationId}`,
        'floor',
        `session:${session.sessionId}`,
      ]);

      await post(`/api/bills/${bill.id}/pay`, a.cashier, { method: 'transfer' }).expect(200);

      const [paid] = await db.select().from(bills).where(eq(bills.id, bill.id));
      const paidAt = paid?.paidAt?.getTime();
      const [order] = await db.select().from(orders).where(eq(orders.id, covered.orderId));
      expect(order?.status).toBe('released');
      expect(order?.releasedAt?.getTime()).toBe(paidAt);
      const items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, covered.orderId));
      for (const item of items) {
        expect(item).toMatchObject({ status: 'waiting', version: 2 });
        expect(item.queueAt?.getTime()).toBe(paidAt);
      }
      const [still] = await db.select().from(orders).where(eq(orders.id, later.orderId));
      expect(still?.status).toBe('awaiting_payment');
      const [pending] = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, later.orderId));
      expect(pending).toMatchObject({ status: 'pending', queueAt: null });

      await expect
        .poll(() => events.events.filter((e) => e.type === 'item.status').length)
        .toBe(items.length * 3);
      events.stop();
      const itemEvents = events.events.filter((e) => e.type === 'item.status');
      expect(new Set(itemEvents.map((e) => e.topic))).toEqual(
        new Set([`station:${a.floor.stationId}`, 'floor', `session:${session.sessionId}`]),
      );
      expect(itemEvents[0]?.data).toMatchObject({
        status: 'waiting',
        sessionId: session.sessionId,
        version: 2,
      });
      expect(t.logs.find((l) => l.msg === 'bill_paid' && l.billId === bill.id)).toMatchObject({
        releasedItems: 2,
      });
      // The rest is a new bill for the later order only.
      expect((await guestBill(session)).body.bill).toMatchObject({
        amountVnd: 30_000,
        status: 'open',
      });
    });

    it('cashier screen shows the 24 h "bank account just changed" warning only within 24 h', async () => {
      const c = await restaurant(false);
      const before = await http().get('/api/bills/overview').set('cookie', c.cashier).expect(200);
      expect(before.body).toMatchObject({ bankConfigured: false, bankChangedRecently: false });
      await setBank(c.owner, BANK);
      const after = await http().get('/api/bills/overview').set('cookie', c.cashier).expect(200);
      expect(after.body).toMatchObject({ bankConfigured: true, bankChangedRecently: true });
      // Staff sessions last 12 h, so look at the warning with the clock moved, then move it back.
      const dayMs = 24 * 60 * 60 * 1000;
      t.clock.advance(11 * 60 * 60 * 1000);
      const sameDay = await http().get('/api/bills/overview').set('cookie', c.cashier).expect(200);
      expect(sameDay.body.bankChangedRecently).toBe(true);
      t.clock.advance(-11 * 60 * 60 * 1000);
      const cashier = await loginCookie(t, c.cashierEmail, STAFF_PASSWORD);
      t.clock.advance(dayMs + 1000);
      try {
        const relog = await loginCookie(t, c.cashierEmail, STAFF_PASSWORD);
        const later = await http().get('/api/bills/overview').set('cookie', relog).expect(200);
        expect(later.body.bankChangedRecently).toBe(false);
      } finally {
        t.clock.advance(-(dayMs + 1000));
      }
      await http().get('/api/bills/overview').set('cookie', cashier).expect(200);
    });

    it('validates input: payment method, unknown keys, malformed ids', async () => {
      const session = await openSession(db, a.floor);
      await addOrder(db, a.floor, session, 'released', [{ priceVnd: 10_000, quantity: 1 }]);
      const bill = (await guestBill(session)).body.bill as { id: string };
      await post(`/api/bills/${bill.id}/pay`, a.cashier, { method: 'card' }).expect(422);
      await post(`/api/bills/${bill.id}/pay`, a.cashier, { method: 'cash', amountVnd: 1 }).expect(
        422,
      );
      await post('/api/bills/not-a-uuid/pay', a.cashier, { method: 'cash' }).expect(404);
      await http().get('/api/bills/not-a-uuid').set('cookie', a.cashier).expect(404);
      await post('/api/sessions/not-a-uuid/close', a.cashier, {}).expect(404);
      await post('/api/bills', a.cashier, { sessionId: 'nope' }).expect(404);
      await http().get('/api/sessions/nope/bill').set('cookie', a.cashier).expect(404);
    });
  });

  describe('roles and tenants', () => {
    it('AC15: kitchen and waiter cannot confirm payment or close a session (403)', async () => {
      const session = await openSession(db, a.floor);
      await addOrder(db, a.floor, session, 'released', [{ priceVnd: 10_000, quantity: 1 }]);
      const bill = (await guestBill(session)).body.bill as { id: string };
      for (const cookie of [a.kitchen, a.waiter]) {
        const res = await post(`/api/bills/${bill.id}/pay`, cookie, { method: 'cash' }).expect(403);
        expect(res.body.code).toBe('FORBIDDEN');
        await post(`/api/sessions/${session.sessionId}/close`, cookie, { reason: 'x' }).expect(403);
        await http().get('/api/bills/overview').set('cookie', cookie).expect(403);
      }
      await post('/api/bills', a.kitchen, { sessionId: session.sessionId }).expect(403);
      const [row] = await db.select().from(bills).where(eq(bills.id, bill.id));
      expect(row?.status).toBe('open');
    });

    it('AC3: B’s cashier cannot see, pay or close A’s bill or session (404) and B’s screen never lists it', async () => {
      const session = await openSession(db, a.floor);
      await addOrder(db, a.floor, session, 'released', [{ priceVnd: 10_000, quantity: 1 }]);
      const bill = (await guestBill(session)).body.bill as { id: string };

      await http().get(`/api/bills/${bill.id}`).set('cookie', b.cashier).expect(404);
      await post(`/api/bills/${bill.id}/pay`, b.cashier, { method: 'cash' }).expect(404);
      await post(`/api/bills/${bill.id}/pay`, b.owner, { method: 'cash' }).expect(404);
      await post(`/api/sessions/${session.sessionId}/close`, b.cashier, { reason: 'x' }).expect(
        404,
      );
      await post('/api/bills', b.cashier, { sessionId: session.sessionId }).expect(404);
      await http()
        .get(`/api/sessions/${session.sessionId}/bill`)
        .set('cookie', b.cashier)
        .expect(404);
      const overview = await http().get('/api/bills/overview').set('cookie', b.cashier).expect(200);
      expect(
        overview.body.sessions.some(
          (s: { sessionId: string }) => s.sessionId === session.sessionId,
        ),
      ).toBe(false);
      const [row] = await db.select().from(bills).where(eq(bills.id, bill.id));
      expect(row?.status).toBe('open');
      const [s] = await db
        .select()
        .from(tableSessions)
        .where(eq(tableSessions.id, session.sessionId));
      expect(s?.status).toBe('open');
    });

    it('a suspended restaurant’s guest cookie no longer opens the bill', async () => {
      const c = await restaurant(true);
      const session = await openSession(db, c.floor);
      await guestBill(session);
      const { restaurants } = await import('../src/db/schema.js');
      await db.update(restaurants).set({ status: 'suspended' }).where(eq(restaurants.id, c.id));
      await http().get('/api/g/bill').set('cookie', session.guestCookie).expect(401);
    });
  });
});
