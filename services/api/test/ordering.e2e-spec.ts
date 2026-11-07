import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { DB, type Database } from '../src/db/database.module.js';
import { restaurants } from '../src/db/schema.js';
import { hashToken } from '../src/identity/domain/session-token.js';
import { guestDevices, orderItems, orders, tableSessions } from '../src/service/service.schema.js';
import { createTestApp, type TestApp } from './support/app.js';
import {
  checkIn,
  guestCookieOf,
  joinPhone,
  line,
  placeOrder,
  setRules,
  setupFloor,
  type FloorRestaurant,
  type GuestPhone,
} from './support/floor.js';
import { ORIGIN } from './support/http.js';
import { STAFF_PASSWORD, addStaff, loginCookie } from './support/staff.js';

describe('guest check-in, ordering and waiter review (e2e, real Postgres)', () => {
  let t: TestApp;
  let db: Database;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp();
    db = t.app.get<symbol, Database>(DB);
  });

  afterAll(async () => {
    await t.app.close();
  });

  const guestView = (phone: GuestPhone) => http().get('/api/g/session').set('cookie', phone.cookie);
  const staffPost = (cookie: string, path: string, body?: object) =>
    http().post(path).set('origin', ORIGIN).set('cookie', cookie).send(body);
  const review = async (cookie: string) =>
    (await http().get('/api/orders/review').set('cookie', cookie).expect(200)).body.items as {
      id: string;
      status: string;
      holdReason: string | null;
      flag: string | null;
      mainPortions: number;
      table: { name: string };
      session: { partySize: number };
      items: { name: string; quantity: number }[];
    }[];
  const itemsOf = (orderId: string) =>
    db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const orderRow = async (orderId: string) =>
    (await db.select().from(orders).where(eq(orders.id, orderId)))[0];
  const sessionsOf = (tableId: string) =>
    db.select().from(tableSessions).where(eq(tableSessions.tableId, tableId));

  describe('S6 check-in and join', () => {
    it('AC17: asks for the party size, then opens a session stamped with the arrival time', async () => {
      const floor = await setupFloor(t, 4);
      const ask = await checkIn(t, floor.qrToken).expect(409);
      expect(ask.body).toMatchObject({ code: 'PARTY_SIZE_REQUIRED', maxPartySize: 8 });
      expect(await sessionsOf(floor.tableId)).toHaveLength(0);

      const before = Date.now();
      const opened = await checkIn(t, floor.qrToken, 3).expect(201);
      expect(opened.body).toMatchObject({
        opened: true,
        session: { tableId: floor.tableId, partySize: 3, status: 'open', openedBy: 'guest' },
      });
      expect(new Date(opened.body.session.openedAt as string).getTime()).toBeGreaterThanOrEqual(
        before - 1000,
      );
    });

    it('AC17 boundary: party size 1 and seats + 4 are accepted; 0, seats + 5 and 2.5 are refused', async () => {
      for (const bad of [0, 9, 2.5]) {
        const floor = await setupFloor(t, 4);
        const response = await checkIn(t, floor.qrToken, bad).expect(422);
        expect(response.body.code).toBe('VALIDATION_FAILED');
        expect(await sessionsOf(floor.tableId)).toHaveLength(0);
      }
      for (const good of [1, 8]) {
        const floor = await setupFloor(t, 4);
        await checkIn(t, floor.qrToken, good).expect(201);
      }
    });

    it('sets an HttpOnly, SameSite=Lax guest cookie and stores only its SHA-256', async () => {
      const floor = await setupFloor(t);
      const response = await checkIn(t, floor.qrToken, 2).expect(201);
      const raw = (response.headers['set-cookie'] as unknown as string[]).find((c) =>
        c.startsWith('tqr_guest='),
      );
      expect(raw).toMatch(/HttpOnly/i);
      expect(raw).toMatch(/SameSite=Lax/i);
      expect(raw).not.toMatch(/Secure/i);
      const token = decodeURIComponent((guestCookieOf(response) ?? '').slice('tqr_guest='.length));
      expect(Buffer.from(token, 'base64url')).toHaveLength(32);
      const rows = await db
        .select()
        .from(guestDevices)
        .where(eq(guestDevices.sessionId, response.body.session.id as string));
      expect(rows.map((row) => row.tokenHash)).toEqual([hashToken(token)]);
    });

    it('marks the guest cookie Secure when not on plain-http localhost', async () => {
      const floor = await setupFloor(t);
      const response = await http()
        .post('/api/g/session')
        .set('host', 'tableqr.example')
        .send({ qrToken: floor.qrToken, partySize: 2 })
        .expect(201);
      const raw = (response.headers['set-cookie'] as unknown as string[]).join(';');
      expect(raw).toMatch(/Secure/i);
    });

    it('AC18: a second phone joins the same session without a party size and sees its orders', async () => {
      const floor = await setupFloor(t);
      const first = await joinPhone(t, floor, 2);
      const placed = await placeOrder(t, first, [line(floor.items.tra, 2)]).expect(201);
      const joined = await checkIn(t, floor.qrToken).expect(200);
      expect(joined.body.opened).toBe(false);
      const second = { cookie: guestCookieOf(joined) ?? '' };
      expect(second.cookie).not.toBe(first.cookie);
      expect(second.cookie).not.toBe('');
      const view = (await guestView(second).expect(200)).body;
      expect(view).toMatchObject({
        table: { name: 'Bàn 1', seats: 4 },
        session: { partySize: 2, status: 'open' },
      });
      expect(view.orders.map((o: { id: string }) => o.id)).toEqual([placed.body.id]);
      expect(await sessionsOf(floor.tableId)).toHaveLength(1);
    });

    it('AC18: the same phone scanning again keeps its cookie (no new device)', async () => {
      const floor = await setupFloor(t);
      const phone = await joinPhone(t, floor, 2);
      const again = await checkIn(t, floor.qrToken, undefined, phone.cookie).expect(200);
      expect(guestCookieOf(again)).toBeUndefined();
      const sessionId = (await guestView(phone)).body.session.id as string;
      expect(
        await db.select().from(guestDevices).where(eq(guestDevices.sessionId, sessionId)),
      ).toHaveLength(1);
    });

    it('AC17/AC18: two phones opening the table at the same moment end in one session', async () => {
      const floor = await setupFloor(t);
      const [a, b] = await Promise.all([
        checkIn(t, floor.qrToken, 2),
        checkIn(t, floor.qrToken, 3),
      ]);
      expect([a.status, b.status].sort((x, y) => x - y)).toEqual([200, 201]);
      expect(a.body.session.id).toBe(b.body.session.id);
      expect(await sessionsOf(floor.tableId)).toHaveLength(1);
    });

    it('AC19: with "staff opens" the guest is told to wait and nothing is opened; after staff opens, the guest joins', async () => {
      const floor = await setupFloor(t);
      await setRules(t, floor.ownerCookie, (rules) => {
        rules.sessionOpening = 'staff_opens';
      });
      const wait = await checkIn(t, floor.qrToken, 2).expect(409);
      expect(wait.body).toMatchObject({
        code: 'WAIT_FOR_STAFF',
        detail: 'Vui lòng chờ nhân viên mở bàn',
      });
      expect(await sessionsOf(floor.tableId)).toHaveLength(0);
      await http().get('/api/g/session').expect(401);

      const waiter = await addStaff(t, floor.ownerCookie, 'waiter');
      const waiterCookie = await loginCookie(t, waiter.body.email, STAFF_PASSWORD);
      const opened = await staffPost(waiterCookie, '/api/sessions', {
        tableId: floor.tableId,
        partySize: 5,
      }).expect(201);
      expect(opened.body).toMatchObject({ partySize: 5, openedBy: 'staff', status: 'open' });
      const joined = await checkIn(t, floor.qrToken).expect(200);
      expect(joined.body.session.id).toBe(opened.body.id);
    });

    it('answers an expired QR with 410 and an unknown one with 404', async () => {
      const floor = await setupFloor(t);
      await staffPost(floor.ownerCookie, `/api/tables/${floor.tableId}/rotate-qr`).expect(200);
      expect((await checkIn(t, floor.qrToken, 2).expect(410)).body.code).toBe('QR_EXPIRED');
      await checkIn(t, 'AAAAAAAAAAAAAAAAAAAAAA', 2).expect(404);
      await checkIn(t, '../../etc', 2).expect(404);
    });

    it('refuses an unknown body field and a missing token (422)', async () => {
      const floor = await setupFloor(t);
      await http()
        .post('/api/g/session')
        .set('origin', ORIGIN)
        .send({ qrToken: floor.qrToken, partySize: 2, restaurantId: floor.restaurantId })
        .expect(422);
      await http().post('/api/g/session').set('origin', ORIGIN).send({}).expect(422);
    });

    it('AC54: a suspended restaurant refuses check-in and every guest call', async () => {
      const floor = await setupFloor(t);
      const phone = await joinPhone(t, floor, 2);
      await db
        .update(restaurants)
        .set({ status: 'suspended' })
        .where(eq(restaurants.id, floor.restaurantId));
      expect((await guestView(phone).expect(403)).body.code).toBe('RESTAURANT_SUSPENDED');
      await placeOrder(t, phone, [line(floor.items.tra)]).expect(403);
      await http().get('/api/g/menu').set('cookie', phone.cookie).expect(403);
      await checkIn(t, floor.qrToken).expect(403);
    });

    it('staff open: 409 when the table is in use, 422 for a party too big, 404 for a foreign or malformed table', async () => {
      const floor = await setupFloor(t, 2);
      const other = await setupFloor(t);
      await staffPost(floor.ownerCookie, '/api/sessions', {
        tableId: floor.tableId,
        partySize: 7,
      }).expect(422);
      await staffPost(floor.ownerCookie, '/api/sessions', {
        tableId: floor.tableId,
        partySize: 6,
      }).expect(201);
      expect(
        (
          await staffPost(floor.ownerCookie, '/api/sessions', {
            tableId: floor.tableId,
            partySize: 2,
          }).expect(409)
        ).body.code,
      ).toBe('SESSION_ALREADY_OPEN');
      await staffPost(floor.ownerCookie, '/api/sessions', {
        tableId: other.tableId,
        partySize: 2,
      }).expect(404);
      await staffPost(floor.ownerCookie, '/api/sessions', {
        tableId: 'nope',
        partySize: 2,
      }).expect(404);
    });

    it('AC21: a closed session refuses orders from its phones; the view says it is closed', async () => {
      const floor = await setupFloor(t);
      const phone = await joinPhone(t, floor, 2);
      await placeOrder(t, phone, [line(floor.items.tra)]).expect(201);
      await db
        .update(tableSessions)
        .set({ status: 'closed', closedAt: new Date() })
        .where(eq(tableSessions.tableId, floor.tableId));
      const refused = await placeOrder(t, phone, [line(floor.items.tra)]).expect(409);
      expect(refused.body.code).toBe('SESSION_CLOSED');
      expect((await guestView(phone).expect(200)).body.session.status).toBe('closed');
    });

    it('answers 401 GUEST_NOT_CHECKED_IN without a cookie or with an unknown one', async () => {
      const none = await http().get('/api/g/session').expect(401);
      expect(none.body.code).toBe('GUEST_NOT_CHECKED_IN');
      await http().get('/api/g/session').set('cookie', 'tqr_guest=forged').expect(401);
      await http()
        .post('/api/g/orders')
        .set('origin', ORIGIN)
        .set('idempotency-key', randomUUID())
        .send({ lines: [] })
        .expect(401);
    });
  });

  describe('S7 ordering', () => {
    let floor: FloorRestaurant;
    let phone: GuestPhone;

    beforeEach(async () => {
      floor = await setupFloor(t);
      phone = await joinPhone(t, floor, 2);
    });

    it('AC22: records the order with a server-side total, its rules snapshot and kitchen fields', async () => {
      const response = await placeOrder(t, phone, [
        line(floor.items.pho, 2, '  ít hành  '),
        line(floor.items.tra, 3),
      ]).expect(201);
      expect(response.body).toMatchObject({
        status: 'released',
        holdReason: null,
        totalVnd: 2 * 45000 + 3 * 5000,
        items: [
          { name: 'Phở bò', quantity: 2, note: 'ít hành', isMain: true, status: 'waiting' },
          { name: 'Trà đá', quantity: 3, note: null, isMain: false, status: 'waiting' },
        ],
      });
      const order = await orderRow(response.body.id as string);
      expect(order?.rulesSnapshot).toMatchObject({
        effectiveFrom: null,
        rules: { orderApproval: 'anomalies_only' },
      });
      expect(order?.releasedAt?.getTime()).toBe(order?.requestedAt.getTime());
      const items = await itemsOf(response.body.id as string);
      const [session] = await sessionsOf(floor.tableId);
      for (const item of items) {
        expect(item.queueAt?.getTime()).toBe(order?.requestedAt.getTime());
        expect(item.sessionOpenedAt.getTime()).toBe(session?.openedAt.getTime());
      }
      expect(items.find((i) => i.menuItemId === floor.items.tra.id)?.stationId).toBe(
        floor.barStationId,
      );
      expect(items.find((i) => i.menuItemId === floor.items.pho.id)?.isMain).toBe('yes');
    });

    it('AC22 boundary: 50 lines, quantity 20 and a 140-character note are accepted', async () => {
      const lines = Array.from({ length: 50 }, (_, i) =>
        line(floor.items.tra, i === 0 ? 20 : 1, i === 0 ? 'x'.repeat(140) : undefined),
      );
      const response = await placeOrder(t, phone, lines).expect(201);
      expect(response.body.items).toHaveLength(50);
    });

    it.each([
      ['no lines', () => []],
      ['51 lines', () => Array.from({ length: 51 }, () => line(floor.items.tra))],
      ['quantity 0', () => [line(floor.items.tra, 0)]],
      ['quantity 21', () => [line(floor.items.tra, 21)]],
      ['fractional quantity', () => [line(floor.items.tra, 1.5)]],
      ['a 141-character note', () => [line(floor.items.tra, 1, 'x'.repeat(141))]],
      ['a malformed item id', () => [{ menuItemId: 'pho', quantity: 1, priceVnd: 5000 }]],
      ['an unknown field', () => [{ ...line(floor.items.tra), stationId: floor.stationId }]],
    ])('AC22 negative: refuses %s with 422 and records nothing', async (_name, lines) => {
      const response = await placeOrder(t, phone, lines()).expect(422);
      expect(response.body.code).toBe('VALIDATION_FAILED');
      expect(
        await db.select().from(orders).where(eq(orders.restaurantId, floor.restaurantId)),
      ).toHaveLength(0);
    });

    it('AC24: refuses a missing or malformed Idempotency-Key (400)', async () => {
      await http()
        .post('/api/g/orders')
        .set('origin', ORIGIN)
        .set('cookie', phone.cookie)
        .send({ lines: [line(floor.items.tra)] })
        .expect(400);
      const bad = await placeOrder(t, phone, [line(floor.items.tra)], 'retry-1').expect(400);
      expect(bad.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });

    it('AC24: a retried submission returns the same order (201 then 200) and records it once', async () => {
      const key = randomUUID();
      const first = await placeOrder(t, phone, [line(floor.items.tra)], key).expect(201);
      const retry = await placeOrder(t, phone, [line(floor.items.tra)], key).expect(200);
      expect(retry.body).toEqual(first.body);
      const parallel = await Promise.all(
        Array.from({ length: 5 }, () =>
          placeOrder(t, phone, [line(floor.items.com)], randomUUID()),
        ),
      );
      const sameKey = await Promise.all(
        Array.from({ length: 5 }, () => placeOrder(t, phone, [line(floor.items.pho)], key)),
      );
      expect(new Set(sameKey.map((r) => r.body.id))).toEqual(new Set([first.body.id]));
      expect(parallel.every((r) => r.status === 201)).toBe(true);
      expect(
        await db.select().from(orders).where(eq(orders.restaurantId, floor.restaurantId)),
      ).toHaveLength(6);
    });

    it('AC24: the same key used by another session is a different order', async () => {
      const other = await setupFloor(t);
      const otherPhone = await joinPhone(t, other, 2);
      const key = randomUUID();
      const a = await placeOrder(t, phone, [line(floor.items.tra)], key).expect(201);
      const b = await placeOrder(t, otherPhone, [line(other.items.tra)], key).expect(201);
      expect(a.body.id).not.toBe(b.body.id);
    });

    it('AC23: two phones submitting at the same moment record two orders, each once', async () => {
      const second = await joinPhone(t, floor);
      const [a, b] = await Promise.all([
        placeOrder(t, phone, [line(floor.items.tra)]),
        placeOrder(t, second, [line(floor.items.tra, 2)]),
      ]);
      expect([a.status, b.status]).toEqual([201, 201]);
      expect(a.body.id).not.toBe(b.body.id);
      const view = (await guestView(phone)).body;
      expect(view.orders).toHaveLength(2);
    });

    it('AC25: an unavailable item or a changed price rejects the cart, lists why and records nothing', async () => {
      const response = await placeOrder(t, phone, [
        line(floor.items.tra),
        line(floor.items.soldOut),
        { ...line(floor.items.pho), priceVnd: 40000 },
        line({ id: randomUUID(), priceVnd: 1000 }),
      ]).expect(409);
      expect(response.body.code).toBe('MENU_CHANGED');
      expect(response.body.problems).toEqual([
        { menuItemId: floor.items.soldOut.id, reason: 'unavailable' },
        { menuItemId: floor.items.pho.id, reason: 'price_changed', priceVnd: 45000 },
        { menuItemId: expect.any(String) as string, reason: 'unknown' },
      ]);
      expect(
        await db.select().from(orders).where(eq(orders.restaurantId, floor.restaurantId)),
      ).toHaveLength(0);
    });

    it('AC25: an item of another restaurant is unknown here', async () => {
      const other = await setupFloor(t);
      const response = await placeOrder(t, phone, [line(other.items.tra)]).expect(409);
      expect(response.body.problems).toEqual([
        { menuItemId: other.items.tra.id, reason: 'unknown' },
      ]);
    });

    it('serves the session restaurant’s menu to the phone', async () => {
      const menu = (await http().get('/api/g/menu').set('cookie', phone.cookie).expect(200)).body;
      expect(menu.restaurant.slug).toBe(floor.slug);
      const names = (menu.categories as { items: { name: string }[] }[]).flatMap((c) =>
        c.items.map((i) => i.name),
      );
      expect(names).toEqual(expect.arrayContaining(['Phở bò', 'Trà đá', 'Bún chả']));
    });

    it('AC12: an order keeps the rules it was placed under after the owner changes them', async () => {
      const before = await placeOrder(t, phone, [line(floor.items.tra)]).expect(201);
      await setRules(t, floor.ownerCookie, (rules) => {
        rules.orderApproval = 'every_order';
      });
      const after = await placeOrder(t, phone, [line(floor.items.tra)]).expect(201);
      expect(after.body.status).toBe('held');
      const old = await orderRow(before.body.id as string);
      const fresh = await orderRow(after.body.id as string);
      expect(old?.rulesSnapshot).toMatchObject({ rules: { orderApproval: 'anomalies_only' } });
      expect(fresh?.rulesSnapshot).toMatchObject({ rules: { orderApproval: 'every_order' } });
      expect(fresh?.rulesSnapshot).toMatchObject({ effectiveFrom: expect.any(String) as string });
    });

    it('AC13: with "pay before cooking" the order waits for payment, out of the kitchen queue', async () => {
      await setRules(t, floor.ownerCookie, (rules) => {
        rules.paymentTiming = 'pay_before';
      });
      const response = await placeOrder(t, phone, [line(floor.items.pho)]).expect(201);
      expect(response.body.status).toBe('awaiting_payment');
      const order = await orderRow(response.body.id as string);
      expect(order?.releasedAt).toBeNull();
      for (const item of await itemsOf(response.body.id as string)) {
        expect(item.status).toBe('pending');
        expect(item.queueAt).toBeNull();
      }
    });
  });

  describe('S8 anomaly hold and waiter review', () => {
    let waiterCookie: string;
    let kitchenCookie: string;
    let floor: FloorRestaurant;

    beforeEach(async () => {
      floor = await setupFloor(t);
      const waiter = await addStaff(t, floor.ownerCookie, 'waiter');
      waiterCookie = await loginCookie(t, waiter.body.email, STAFF_PASSWORD);
      const kitchen = await addStaff(t, floor.ownerCookie, 'kitchen');
      kitchenCookie = await loginCookie(t, kitchen.body.email, STAFF_PASSWORD);
    });

    it('AC26: exactly party × max is released; one more main portion is held with the reason shown to the guest', async () => {
      const phone = await joinPhone(t, floor, 1);
      const ok = await placeOrder(t, phone, [
        line(floor.items.pho, 2),
        line(floor.items.tra, 5),
      ]).expect(201);
      expect(ok.body.status).toBe('released');
      const held = await placeOrder(t, phone, [line(floor.items.com)]).expect(201);
      expect(held.body).toMatchObject({ status: 'held', holdReason: 'anomaly_over' });
      for (const item of await itemsOf(held.body.id as string)) {
        expect(item.status).toBe('pending');
        expect(item.queueAt).toBeNull();
      }
      const view = (await guestView(phone)).body;
      expect(view.orders[1]).toMatchObject({ status: 'held', holdReason: 'anomaly_over' });
      const list = await review(waiterCookie);
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        id: held.body.id,
        holdReason: 'anomaly_over',
        mainPortions: 1,
        table: { name: 'Bàn 1' },
        session: { partySize: 1 },
        items: [{ name: 'Cơm tấm', quantity: 1 }],
      });
    });

    it('AC27: below the minimum at the first order is flagged, not held; the waiter can mark it seen', async () => {
      const phone = await joinPhone(t, floor, 4);
      const order = await placeOrder(t, phone, [line(floor.items.pho)]).expect(201);
      expect(order.body.status).toBe('released');
      expect((await orderRow(order.body.id as string))?.flag).toBe('maybe_short');
      const list = await review(waiterCookie);
      expect(list.map((o) => [o.id, o.status, o.flag])).toEqual([
        [order.body.id, 'released', 'maybe_short'],
      ]);
      // A second order is never flagged.
      const next = await placeOrder(t, phone, [line(floor.items.tra)]).expect(201);
      expect((await orderRow(next.body.id as string))?.flag).toBeNull();
      await staffPost(waiterCookie, `/api/orders/${order.body.id as string}/flag-seen`).expect(204);
      expect(await review(waiterCookie)).toEqual([]);
      await staffPost(kitchenCookie, `/api/orders/${order.body.id as string}/flag-seen`).expect(
        403,
      );
    });

    it('AC28: confirm releases the order with its original request time as queue position', async () => {
      const phone = await joinPhone(t, floor, 1);
      const held = await placeOrder(t, phone, [line(floor.items.pho, 3)]).expect(201);
      const requestedAt = (await orderRow(held.body.id as string))?.requestedAt.getTime();
      t.clock.advance(5 * 60_000);
      const confirmed = await staffPost(
        waiterCookie,
        `/api/orders/${held.body.id as string}/confirm`,
      ).expect(200);
      expect(confirmed.body.status).toBe('released');
      const order = await orderRow(held.body.id as string);
      expect(order?.decidedBy).not.toBeNull();
      expect(order?.releasedAt?.getTime()).toBeGreaterThan((requestedAt ?? 0) + 4 * 60_000);
      for (const item of await itemsOf(held.body.id as string)) {
        expect(item.status).toBe('waiting');
        expect(item.queueAt?.getTime()).toBe(requestedAt);
        expect(item.version).toBe(2);
      }
      expect(await review(waiterCookie)).toEqual([]);
      const again = await staffPost(
        waiterCookie,
        `/api/orders/${held.body.id as string}/confirm`,
      ).expect(409);
      expect(again.body.code).toBe('ORDER_NOT_HELD');
    });

    it('AC28: reject cancels the order and its items, and the guest sees it', async () => {
      const phone = await joinPhone(t, floor, 1);
      const held = await placeOrder(t, phone, [line(floor.items.pho, 3)]).expect(201);
      const rejected = await staffPost(
        floor.ownerCookie,
        `/api/orders/${held.body.id as string}/reject`,
      ).expect(200);
      expect(rejected.body.status).toBe('rejected');
      expect(rejected.body.items.every((i: { status: string }) => i.status === 'cancelled')).toBe(
        true,
      );
      expect((await guestView(phone)).body.orders[0].status).toBe('rejected');
      await staffPost(waiterCookie, `/api/orders/${held.body.id as string}/reject`).expect(409);
      // Rejected portions no longer count: 2 mains for 1 person now pass.
      expect((await placeOrder(t, phone, [line(floor.items.com, 2)]).expect(201)).body.status).toBe(
        'released',
      );
    });

    it('AC28 + AC13: a confirmed order under "pay before cooking" waits for payment', async () => {
      await setRules(t, floor.ownerCookie, (rules) => {
        rules.paymentTiming = 'pay_before';
      });
      const phone = await joinPhone(t, floor, 1);
      const held = await placeOrder(t, phone, [line(floor.items.pho, 3)]).expect(201);
      expect(held.body.status).toBe('held');
      const confirmed = await staffPost(
        waiterCookie,
        `/api/orders/${held.body.id as string}/confirm`,
      ).expect(200);
      expect(confirmed.body.status).toBe('awaiting_payment');
      expect((await itemsOf(held.body.id as string)).every((i) => i.status === 'pending')).toBe(
        true,
      );
    });

    it('AC29: with "every order" each order is held, however small', async () => {
      await setRules(t, floor.ownerCookie, (rules) => {
        rules.orderApproval = 'every_order';
      });
      const phone = await joinPhone(t, floor, 4);
      const order = await placeOrder(t, phone, [line(floor.items.tra)]).expect(201);
      expect(order.body).toMatchObject({ status: 'held', holdReason: 'every_order' });
    });

    it('with approval "none" nothing is held', async () => {
      await setRules(t, floor.ownerCookie, (rules) => {
        rules.orderApproval = 'none';
      });
      const phone = await joinPhone(t, floor, 1);
      expect((await placeOrder(t, phone, [line(floor.items.pho, 9)]).expect(201)).body.status).toBe(
        'released',
      );
    });

    it('AC20: a bigger party releases anomaly-held orders, keeping their queue time; every_order holds stay', async () => {
      const phone = await joinPhone(t, floor, 1);
      const held = await placeOrder(t, phone, [line(floor.items.pho, 3)]).expect(201);
      const sessionId = (await guestView(phone)).body.session.id as string;
      await http()
        .patch(`/api/sessions/${sessionId}`)
        .set('origin', ORIGIN)
        .set('cookie', waiterCookie)
        .send({ partySize: 1 })
        .expect(200);
      expect((await orderRow(held.body.id as string))?.status).toBe('held');
      const requestedAt = (await orderRow(held.body.id as string))?.requestedAt.getTime();
      const changed = await http()
        .patch(`/api/sessions/${sessionId}`)
        .set('origin', ORIGIN)
        .set('cookie', waiterCookie)
        .send({ partySize: 2 })
        .expect(200);
      expect(changed.body.partySize).toBe(2);
      expect((await orderRow(held.body.id as string))?.status).toBe('released');
      for (const item of await itemsOf(held.body.id as string)) {
        expect(item.queueAt?.getTime()).toBe(requestedAt);
      }

      await setRules(t, floor.ownerCookie, (rules) => {
        rules.orderApproval = 'every_order';
      });
      const always = await placeOrder(t, phone, [line(floor.items.tra)]).expect(201);
      await http()
        .patch(`/api/sessions/${sessionId}`)
        .set('origin', ORIGIN)
        .set('cookie', waiterCookie)
        .send({ partySize: 6 })
        .expect(200);
      expect((await orderRow(always.body.id as string))?.status).toBe('held');
    });

    it('AC20 negatives: party size out of range 422, closed session 409, foreign or malformed 404, kitchen 403', async () => {
      const phone = await joinPhone(t, floor, 1);
      const sessionId = (await guestView(phone)).body.session.id as string;
      const patch = (cookie: string, id: string, partySize: number) =>
        http()
          .patch(`/api/sessions/${id}`)
          .set('origin', ORIGIN)
          .set('cookie', cookie)
          .send({ partySize });
      await patch(waiterCookie, sessionId, 9).expect(422);
      await patch(waiterCookie, sessionId, 0).expect(422);
      await patch(kitchenCookie, sessionId, 2).expect(403);
      await patch(waiterCookie, 'abc', 2).expect(404);
      const other = await setupFloor(t);
      await patch(other.ownerCookie, sessionId, 2).expect(404);
      await db
        .update(tableSessions)
        .set({ status: 'closed' })
        .where(eq(tableSessions.id, sessionId));
      expect((await patch(waiterCookie, sessionId, 2).expect(409)).body.code).toBe(
        'SESSION_CLOSED',
      );
    });

    it('roles: the kitchen cannot list, confirm or reject; nobody without a session can', async () => {
      const phone = await joinPhone(t, floor, 1);
      const held = await placeOrder(t, phone, [line(floor.items.pho, 3)]).expect(201);
      const id = held.body.id as string;
      for (const path of [`/api/orders/${id}/confirm`, `/api/orders/${id}/reject`]) {
        expect((await staffPost(kitchenCookie, path).expect(403)).body.code).toBe('FORBIDDEN');
        await http().post(path).set('origin', ORIGIN).expect(401);
      }
      await http().get('/api/orders/review').set('cookie', kitchenCookie).expect(403);
      await staffPost(kitchenCookie, '/api/sessions', {
        tableId: floor.tableId,
        partySize: 2,
      }).expect(403);
      expect((await orderRow(id))?.status).toBe('held');
    });

    it('AC3 isolation: staff of A cannot see, confirm or reject B’s orders (404) and B’s order is unchanged', async () => {
      const phone = await joinPhone(t, floor, 1);
      const held = await placeOrder(t, phone, [line(floor.items.pho, 3)]).expect(201);
      const other = await setupFloor(t);
      const id = held.body.id as string;
      await staffPost(other.ownerCookie, `/api/orders/${id}/confirm`).expect(404);
      await staffPost(other.ownerCookie, `/api/orders/${id}/reject`).expect(404);
      await staffPost(other.ownerCookie, `/api/orders/${id}/flag-seen`).expect(404);
      await staffPost(other.ownerCookie, '/api/orders/not-a-uuid/confirm').expect(404);
      expect(await review(other.ownerCookie)).toEqual([]);
      expect((await orderRow(id))?.status).toBe('held');
    });

    it('AC3 isolation: a guest cookie only ever reaches its own session', async () => {
      const a = await joinPhone(t, floor, 2);
      const other = await setupFloor(t);
      const b = await joinPhone(t, other, 2);
      const orderB = await placeOrder(t, b, [line(other.items.tra)]).expect(201);
      const viewA = (await guestView(a)).body;
      expect(viewA.orders).toEqual([]);
      expect(JSON.stringify(viewA)).not.toContain(orderB.body.id as string);
      // A's phone cannot order from B's menu, even with B's ids and prices.
      await placeOrder(t, a, [line(other.items.tra)]).expect(409);
      const rows = await db
        .select()
        .from(orders)
        .where(and(eq(orders.restaurantId, floor.restaurantId)));
      expect(rows).toHaveLength(0);
    });
  });
});
