import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { BookingService } from '../src/booking/booking.service.js';
import { RetentionJob } from '../src/booking/retention.job.js';
import { localToUtc, utcToLocal } from '../src/booking/domain/slots.js';
import { DB, type Database } from '../src/db/database.module.js';
import { bookings, tableSessions } from '../src/db/schema.js';
import { DEFAULT_RULES, type HouseRules } from '../src/settings/domain/house-rules.js';
import { createTestApp, type TestApp } from './support/app.js';
import { ORIGIN, signUp } from './support/http.js';
import { openSse } from './support/sse.js';
import { STAFF_PASSWORD, addStaff, loginCookie, platformAdminCookie } from './support/staff.js';

interface Owner {
  cookie: string;
  email: string;
  password: string;
  restaurantId: string;
  slug: string;
}

interface Booked {
  id: string;
  status: string;
  date: string;
  time: string;
  partySize: number;
}

interface StaffBooking extends Booked {
  tableId: string;
  tableName: string;
  guestName: string | null;
  guestPhone: string | null;
  note: string | null;
  late: boolean;
  version: number;
}

const DAY_MS = 86_400_000;
let phoneCounter = 0;
/** A fresh valid mobile per call, so the 5-per-phone guard only bites where a test wants it. */
const newPhone = (): string => {
  phoneCounter += 1;
  return `09${String(10_000_000 + phoneCounter).slice(-8)}`;
};

describe('table booking (e2e, spec S14–S15, ADR 0007)', () => {
  let t: TestApp;
  let db: Database;
  const http = () => request(t.app.getHttpServer());

  /** A local date `n` days after the test clock's today (always in the future for n ≥ 1). */
  const day = (n: number): string =>
    utcToLocal(new Date(t.clock.now().getTime() + n * DAY_MS)).date;

  const owner = async (): Promise<Owner> => {
    const { cookie, response, body } = await signUp(t);
    const restaurant = response.body.restaurant as { id: string; slug: string };
    return {
      cookie,
      email: body.email,
      password: body.password,
      restaurantId: restaurant.id,
      slug: restaurant.slug,
    };
  };

  /** Moves the test clock; sessions older than 12 h expire, so the owner signs in again. */
  const advanceTo = async (o: Owner, at: number) => {
    t.clock.advance(at - t.clock.now().getTime());
    o.cookie = await loginCookie(t, o.email, o.password);
  };

  const addTable = async (o: Owner, name: string, seats: number): Promise<string> =>
    (
      await http()
        .post('/api/tables')
        .set('origin', ORIGIN)
        .set('cookie', o.cookie)
        .send({ name, seats })
        .expect(201)
    ).body.id as string;

  const setRules = async (o: Owner, booking: Partial<HouseRules['booking']>) => {
    const rules = structuredClone(DEFAULT_RULES);
    rules.booking = { ...rules.booking, ...booking };
    await http()
      .put('/api/restaurant/settings')
      .set('origin', ORIGIN)
      .set('cookie', o.cookie)
      .send({ rules, bank: null })
      .expect(200);
  };

  const book = (slug: string, body: Record<string, unknown>, key: string | null = randomUUID()) => {
    const call = http().post(`/api/g/r/${slug}/bookings`).set('origin', ORIGIN);
    if (key !== null) call.set('idempotency-key', key);
    return call.send({ name: 'Nguyễn Văn An', phone: newPhone(), partySize: 2, ...body });
  };

  const list = async (o: Owner, date: string): Promise<StaffBooking[]> =>
    (await http().get(`/api/bookings?date=${date}`).set('cookie', o.cookie).expect(200)).body
      .items as StaffBooking[];

  const act = (o: Owner, id: string, action: string, body?: object) => {
    const call = http()
      .post(`/api/bookings/${id}/${action}`)
      .set('origin', ORIGIN)
      .set('cookie', o.cookie);
    return body === undefined ? call : call.send(body);
  };

  beforeAll(async () => {
    t = await createTestApp();
    await t.app.listen(0, '127.0.0.1');
    db = t.app.get<symbol, Database>(DB);
  });

  afterAll(async () => {
    await t.app.close();
  });

  describe('guest booking (TQR-020)', () => {
    it('AC48 books the smallest free table that seats the party, "Chờ duyệt" (pending)', async () => {
      const o = await owner();
      await addTable(o, 'Bàn 8', 8);
      await addTable(o, 'Bàn 2', 2);
      const four = await addTable(o, 'Bàn 4', 4);
      const date = day(2);
      const created = await book(o.slug, {
        date,
        time: '19:00',
        partySize: 3,
        phone: '0912 345 678',
        note: '  Có trẻ nhỏ ',
      }).expect(201);
      expect(created.body).toMatchObject({ status: 'pending', date, time: '19:00', partySize: 3 });
      expect(created.body.startsAt).toBe(localToUtc(date, '19:00').toISOString());
      expect(created.body).not.toHaveProperty('tableId');

      const [row] = await list(o, date);
      expect(row).toMatchObject({
        id: created.body.id,
        tableId: four,
        tableName: 'Bàn 4',
        guestName: 'Nguyễn Văn An',
        guestPhone: '+84912345678',
        note: 'Có trẻ nhỏ',
        late: false,
      });
    });

    it('TQR-024 never books a hidden table, and staff cannot move a booking onto one', async () => {
      const o = await owner();
      const hidden = await addTable(o, 'Bàn 2', 2);
      const four = await addTable(o, 'Bàn 4', 4);
      await http()
        .post(`/api/tables/${hidden}/archive`)
        .set('origin', ORIGIN)
        .set('cookie', o.cookie)
        .expect(200);
      const date = day(2);
      const created = await book(o.slug, { date, time: '12:00', partySize: 2 }).expect(201);
      const [row] = await list(o, date);
      expect(row).toMatchObject({ id: created.body.id, tableId: four });
      const moved = await act(o, created.body.id as string, 'confirm', { tableId: hidden }).expect(
        404,
      );
      expect(moved.body.code).toBe('NOT_FOUND');
      // With the only fitting table taken, the hidden one is still not offered.
      const refused = await book(o.slug, { date, time: '12:00', partySize: 2 }).expect(409);
      expect(refused.body.code).toBe('NO_TABLE_FREE');
    });

    it('TQR-024 seating a booking whose table was hidden afterwards answers 404 like staff open; moved to a shown table it seats', async () => {
      const o = await owner();
      const table = await addTable(o, 'Bàn 2', 2);
      const other = await addTable(o, 'Bàn 4', 4);
      const date = day(2);
      const created = await book(o.slug, { date, time: '12:00', partySize: 2 }).expect(201);
      const id = created.body.id as string;
      expect((await list(o, date))[0]).toMatchObject({ id, tableId: table });
      // The owner hides the table after the booking was made (nobody sits there yet).
      await http()
        .post(`/api/tables/${table}/archive`)
        .set('origin', ORIGIN)
        .set('cookie', o.cookie)
        .expect(200);
      // Staff open on a hidden table answers 404 NOT_FOUND; seating its booking must match.
      const opened = await http()
        .post('/api/sessions')
        .set('origin', ORIGIN)
        .set('cookie', o.cookie)
        .send({ tableId: table, partySize: 2 })
        .expect(404);
      expect(opened.body.code).toBe('NOT_FOUND');
      const seated = await act(o, id, 'seat').expect(404);
      expect(seated.body.code).toBe('NOT_FOUND');
      const db = t.app.get(DB);
      const sessions = await db
        .select({ id: tableSessions.id })
        .from(tableSessions)
        .where(eq(tableSessions.tableId, table));
      expect(sessions).toEqual([]);
      expect((await list(o, date))[0]).toMatchObject({ id, status: 'pending', tableId: table });
      // The way out: move the booking to a shown table, then seat it.
      await act(o, id, 'confirm', { tableId: other }).expect(200);
      expect((await act(o, id, 'seat').expect(200)).body).toMatchObject({ status: 'seated' });
    });

    it('AC48 offers the nearest free start times when no table is free, and back-to-back slots fit', async () => {
      const o = await owner();
      await addTable(o, 'Bàn 1', 4);
      const date = day(3);
      await book(o.slug, { date, time: '19:00' }).expect(201);
      const refused = await book(o.slug, { date, time: '19:30' }).expect(409);
      expect(refused.body.code).toBe('NO_TABLE_FREE');
      expect(refused.body.nearest).toEqual([
        { date, time: '17:00' },
        { date, time: '17:30' },
        { date, time: '20:30' },
      ]);
      // The 90-minute slot 19:00–20:30 leaves the table free from 20:30 on.
      await book(o.slug, { date, time: '20:30' }).expect(201);
      await book(o.slug, { date, time: '17:30' }).expect(201);
    });

    it('AC48 refuses a party larger than every table with no alternatives', async () => {
      const o = await owner();
      await addTable(o, 'Bàn 1', 4);
      const refused = await book(o.slug, { date: day(2), time: '12:00', partySize: 5 }).expect(409);
      expect(refused.body).toMatchObject({ code: 'NO_TABLE_FREE', nearest: [] });
    });

    it.each([
      ['in the past', -1, '19:00', {}, 'past'],
      ['before opening', 2, '09:30', {}, 'outside_hours'],
      ['a slot ending after closing', 2, '21:00', {}, 'outside_hours'],
      ['more than 60 days ahead', 61, '12:00', {}, 'too_far'],
      ['with booking turned off', 2, '12:00', { enabled: false }, 'booking_disabled'],
    ])('AC49 refuses a booking %s with the reason', async (_case, offset, time, rules, reason) => {
      const o = await owner();
      await addTable(o, 'Bàn 1', 4);
      if (Object.keys(rules).length > 0) await setRules(o, rules);
      const refused = await book(o.slug, { date: day(offset), time }).expect(422);
      expect(refused.body).toMatchObject({ code: 'BOOKING_NOT_ALLOWED', reason });
    });

    it('AC49 refuses a closed day', async () => {
      const o = await owner();
      await addTable(o, 'Bàn 1', 4);
      const date = day(2);
      const weekday = (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const)[
        new Date(`${date}T00:00:00Z`).getUTCDay()
      ];
      if (!weekday) throw new Error('weekday');
      const openingHours = structuredClone(DEFAULT_RULES.booking.openingHours);
      openingHours[weekday] = { closed: true, open: '10:00', close: '22:00' };
      await setRules(o, { openingHours });
      const refused = await book(o.slug, { date, time: '12:00' }).expect(422);
      expect(refused.body.reason).toBe('closed_day');
      const slots = await http().get(`/api/g/r/${o.slug}/slots?date=${date}`).expect(200);
      expect(slots.body.times).toEqual([]);
    });

    it.each([
      ['a phone that is not a Vietnamese mobile', { phone: '0212345678' }, 'phone'],
      ['a one-letter name', { name: 'A' }, 'name'],
      ['a name of 61 characters', { name: 'ễ'.repeat(61) }, 'name'],
      ['a party of 0', { partySize: 0 }, 'partySize'],
      ['a party of 31', { partySize: 31 }, 'partySize'],
      ['a note of 141 characters', { note: 'x'.repeat(141) }, 'note'],
      ['a malformed date', { date: '2026-02-30' }, 'date'],
      ['a malformed time', { time: '7pm' }, 'time'],
      ['an unknown field', { tableId: 'x' }, '(body)'],
    ])('refuses %s with a field error', async (_case, patch, path) => {
      const o = await owner();
      await addTable(o, 'Bàn 1', 4);
      const refused = await book(o.slug, { date: day(2), time: '12:00', ...patch }).expect(422);
      expect(refused.body.code).toBe('VALIDATION_FAILED');
      expect(refused.body.fields.map((f: { path: string }) => f.path)).toContain(path);
    });

    it('accepts the boundaries: party of 30, a 2-letter name, a 140-character note', async () => {
      const o = await owner();
      await addTable(o, 'Bàn lớn', 30);
      await book(o.slug, {
        date: day(2),
        time: '12:00',
        partySize: 30,
        name: 'Ân',
        note: 'ễ'.repeat(140),
      }).expect(201);
    });

    it('requires a well-formed Idempotency-Key', async () => {
      const o = await owner();
      await addTable(o, 'Bàn 1', 4);
      const missing = await book(o.slug, { date: day(2), time: '12:00' }, null).expect(422);
      expect(missing.body.fields).toEqual([{ path: 'Idempotency-Key', code: 'invalid' }]);
      await book(o.slug, { date: day(2), time: '12:00' }, 'short').expect(422);
    });

    it('returns the same booking when a request is retried with the same Idempotency-Key', async () => {
      const o = await owner();
      await addTable(o, 'Bàn 1', 4);
      await addTable(o, 'Bàn 2', 4);
      const date = day(2);
      const key = randomUUID();
      const phone = newPhone();
      const first = await book(o.slug, { date, time: '12:00', phone }, key).expect(201);
      const retry = await book(o.slug, { date, time: '12:00', phone }, key).expect(201);
      expect(retry.body).toEqual(first.body);
      const [a, b] = await Promise.all([
        book(o.slug, { date, time: '18:00' }, 'parallel-key-1'),
        book(o.slug, { date, time: '18:00' }, 'parallel-key-1'),
      ]);
      expect(a.body.id).toBe(b.body.id);
      expect(await list(o, date)).toHaveLength(2);
    });

    it('AC50 lets exactly one of ten simultaneous guests take the last table', async () => {
      const o = await owner();
      await addTable(o, 'Bàn cuối', 4);
      const date = day(4);
      const results = await Promise.all(
        Array.from({ length: 10 }, () => book(o.slug, { date, time: '19:00' })),
      );
      const statuses = results.map((r) => r.status);
      const seen = JSON.stringify(results.map((r) => [r.status, r.body.code]));
      expect(
        statuses.filter((s) => s === 201),
        seen,
      ).toHaveLength(1);
      expect(
        statuses.filter((s) => s === 409),
        seen,
      ).toHaveLength(9);
      for (const r of results.filter((x) => x.status === 409)) {
        expect(r.body.code).toBe('NO_TABLE_FREE');
      }
      expect(await list(o, date)).toHaveLength(1);
    });

    it('AC50 spreads simultaneous guests over the free tables, one each', async () => {
      const o = await owner();
      await addTable(o, 'Bàn A', 4);
      await addTable(o, 'Bàn B', 4);
      await addTable(o, 'Bàn C', 4);
      const date = day(4);
      const results = await Promise.all(
        Array.from({ length: 6 }, () => book(o.slug, { date, time: '12:00' })),
      );
      expect(
        results.filter((r) => r.status === 201),
        JSON.stringify(results.map((r) => [r.status, r.body.code])),
      ).toHaveLength(3);
      const rows = await list(o, date);
      expect(new Set(rows.map((r) => r.tableId)).size).toBe(3);
    });

    it('refuses a 6th booking from one phone within 24 hours (TOO_MANY_BOOKINGS)', async () => {
      const o = await owner();
      await addTable(o, 'Bàn 1', 4);
      const phone = '0987 000 111';
      for (const time of ['10:00', '12:00', '14:00', '16:00', '18:00']) {
        await book(o.slug, { date: day(5), time, phone }).expect(201);
      }
      const refused = await book(o.slug, { date: day(6), time: '12:00', phone }).expect(409);
      expect(refused.body.code).toBe('TOO_MANY_BOOKINGS');
      // Another restaurant is not affected.
      const other = await owner();
      await addTable(other, 'Bàn 1', 4);
      await book(other.slug, { date: day(6), time: '12:00', phone }).expect(201);
    });

    it('lists the start times of a day with whether a table is still free', async () => {
      const o = await owner();
      await addTable(o, 'Bàn 1', 4);
      const date = day(2);
      await book(o.slug, { date, time: '19:00' }).expect(201);
      const slots = await http().get(`/api/g/r/${o.slug}/slots?date=${date}&party=2`).expect(200);
      expect(slots.body).toMatchObject({ date, enabled: true, slotMinutes: 90 });
      expect(slots.body.restaurant.slug).toBe(o.slug);
      const times = slots.body.times as { time: string; free: boolean }[];
      expect(times[0]).toEqual({ time: '10:00', free: true });
      expect(times.at(-1)).toEqual({ time: '20:30', free: true });
      expect(times.find((x) => x.time === '19:00')?.free).toBe(false);
      expect(times.find((x) => x.time === '17:30')?.free).toBe(true);
      expect(times.find((x) => x.time === '18:00')?.free).toBe(false);
      const big = await http().get(`/api/g/r/${o.slug}/slots?date=${date}&party=5`).expect(200);
      expect((big.body.times as { free: boolean }[]).every((x) => !x.free)).toBe(true);
      await http().get(`/api/g/r/${o.slug}/slots?date=nope`).expect(422);
      await http().get(`/api/g/r/${o.slug}/slots?date=${date}&party=31`).expect(422);
      const past = await http()
        .get(`/api/g/r/${o.slug}/slots?date=${day(-1)}`)
        .expect(200);
      expect(past.body.times).toEqual([]);
    });

    it('AC54 a suspended restaurant answers "Nhà hàng tạm ngưng"; an unknown slug is not found', async () => {
      const o = await owner();
      await addTable(o, 'Bàn 1', 4);
      const admin = await platformAdminCookie(t);
      await http()
        .post(`/api/admin/restaurants/${o.restaurantId}/suspend`)
        .set('origin', ORIGIN)
        .set('cookie', admin.cookie)
        .expect(200);
      const slots = await http()
        .get(`/api/g/r/${o.slug}/slots?date=${day(2)}`)
        .expect(403);
      expect(slots.body).toMatchObject({
        code: 'RESTAURANT_SUSPENDED',
        detail: 'Nhà hàng tạm ngưng',
      });
      const refused = await book(o.slug, { date: day(2), time: '12:00' }).expect(403);
      expect(refused.body.code).toBe('RESTAURANT_SUSPENDED');
      await http()
        .get(`/api/g/r/khong-co-quan-nay/slots?date=${day(2)}`)
        .expect(404);
      await http()
        .get(`/api/g/r/BAD_SLUG!/slots?date=${day(2)}`)
        .expect(404);
      await book('khong-co-quan-nay', { date: day(2), time: '12:00' }).expect(404);
    });

    it('publishes booking.status on the floor topic without personal data', async () => {
      const o = await owner();
      await addTable(o, 'Bàn 1', 4);
      const server = t.app.getHttpServer() as unknown as { address: () => AddressInfo };
      const client = await openSse(
        `http://127.0.0.1:${String(server.address().port)}/api/stream/floor`,
        o.cookie,
      );
      try {
        await client.waitFor((m) => m.event === 'snapshot');
        const created = await book(o.slug, { date: day(2), time: '12:00' }).expect(201);
        const delta = await client.waitFor((m) => m.event === 'delta');
        expect(delta.data).toMatchObject({
          topic: 'floor',
          type: 'booking.status',
          bookingId: created.body.id,
          status: 'pending',
          version: 1,
        });
        expect(JSON.stringify(delta.data)).not.toMatch(/Nguyễn|\+84/u);
        await act(o, created.body.id as string, 'confirm', {}).expect(200);
        const confirmed = await client.waitFor(
          (m) => m.event === 'delta' && m.data.status === 'confirmed',
        );
        expect(confirmed.data.version).toBe(2);
      } finally {
        client.close();
      }
    });
  });

  describe('staff booking list (TQR-021)', () => {
    it('AC51 confirms a booking and can move it to another table that fits and is free', async () => {
      const o = await owner();
      const small = await addTable(o, 'Bàn 2', 2);
      const four = await addTable(o, 'Bàn 4', 4);
      const six = await addTable(o, 'Bàn 6', 6);
      const date = day(2);
      const a = (await book(o.slug, { date, time: '19:00', partySize: 3 }).expect(201))
        .body as Booked;
      const b = (await book(o.slug, { date, time: '19:00', partySize: 3 }).expect(201))
        .body as Booked;

      const confirmed = await act(o, a.id, 'confirm', {}).expect(200);
      expect(confirmed.body).toMatchObject({ status: 'confirmed', tableId: four, version: 2 });

      // b holds Bàn 6; moving a onto it overlaps → the same constraint refuses.
      const busy = await act(o, a.id, 'confirm', { tableId: six }).expect(409);
      expect(busy.body.code).toBe('TABLE_BUSY');
      const tooSmall = await act(o, a.id, 'confirm', { tableId: small }).expect(422);
      expect(tooSmall.body.code).toBe('TABLE_TOO_SMALL');
      await act(o, a.id, 'confirm', { tableId: randomUUID() }).expect(404);
      await act(o, a.id, 'confirm', { tableId: 'not-a-uuid' }).expect(404);
      await act(o, a.id, 'confirm', { tableId: four, extra: 1 }).expect(422);

      await act(o, b.id, 'cancel').expect(200);
      const moved = await act(o, a.id, 'confirm', { tableId: six }).expect(200);
      expect(moved.body).toMatchObject({ status: 'confirmed', tableId: six, tableName: 'Bàn 6' });

      const rows = await list(o, date);
      expect(rows.map((r) => [r.id, r.status])).toEqual(
        expect.arrayContaining([
          [a.id, 'confirmed'],
          [b.id, 'cancelled'],
        ]),
      );
      const wrong = await act(o, b.id, 'confirm', {}).expect(409);
      expect(wrong.body).toMatchObject({
        code: 'BOOKING_WRONG_STATUS',
        bookingStatus: 'cancelled',
      });
    });

    it('lists today by default and refuses a malformed date', async () => {
      const o = await owner();
      const today = await http().get('/api/bookings').set('cookie', o.cookie).expect(200);
      expect(today.body).toEqual({ date: utcToLocal(t.clock.now()).date, items: [] });
      await http().get('/api/bookings?date=2026-13-01').set('cookie', o.cookie).expect(422);
    });

    it('AC52 seats the party: opens a session at that table with the booked party size', async () => {
      const o = await owner();
      const table = await addTable(o, 'Bàn 1', 6);
      const date = day(2);
      const lunch = (await book(o.slug, { date, time: '11:00', partySize: 5 }).expect(201))
        .body as Booked;
      const dinner = (await book(o.slug, { date, time: '19:00', partySize: 4 }).expect(201))
        .body as Booked;

      const seated = await act(o, dinner.id, 'seat').expect(200);
      expect(seated.body.status).toBe('seated');
      const sessions = await db
        .select()
        .from(tableSessions)
        .where(
          and(eq(tableSessions.restaurantId, o.restaurantId), eq(tableSessions.tableId, table)),
        );
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({
        status: 'open',
        partySize: 4,
        openedBy: 'booking',
        bookingId: dinner.id,
      });

      // The table already has an open session: the other booking cannot be seated there.
      const busy = await act(o, lunch.id, 'seat').expect(409);
      expect(busy.body.code).toBe('TABLE_HAS_OPEN_SESSION');
      const [still] = (await list(o, date)).filter((r) => r.id === lunch.id);
      expect(still?.status).toBe('pending');
      await act(o, dinner.id, 'seat').expect(409);
    });

    it('cancelling frees the table for another guest', async () => {
      const o = await owner();
      await addTable(o, 'Bàn 1', 4);
      const date = day(2);
      const first = (await book(o.slug, { date, time: '12:00' }).expect(201)).body as Booked;
      await book(o.slug, { date, time: '12:00' }).expect(409);
      const cancelled = await act(o, first.id, 'cancel').expect(200);
      expect(cancelled.body.status).toBe('cancelled');
      await book(o.slug, { date, time: '12:00' }).expect(201);
    });

    it('AC53 marks a waiting booking "Trễ" 15 minutes after its time; no-show only after the time', async () => {
      const o = await owner();
      await addTable(o, 'Bàn 1', 4);
      await addTable(o, 'Bàn 2', 4);
      const date = day(1);
      const waiting = (await book(o.slug, { date, time: '12:00' }).expect(201)).body as Booked & {
        startsAt: string;
      };
      const seatedEarly = (await book(o.slug, { date, time: '12:00' }).expect(201)).body as Booked;
      await act(o, seatedEarly.id, 'seat').expect(200);
      const early = await act(o, waiting.id, 'no-show').expect(409);
      expect(early.body.code).toBe('TOO_EARLY_FOR_NO_SHOW');

      const start = Date.parse(waiting.startsAt);
      await advanceTo(o, start + 14 * 60_000);
      expect((await list(o, date)).find((r) => r.id === waiting.id)?.late).toBe(false);
      t.clock.advance(60_000);
      const rows = await list(o, date);
      expect(rows.find((r) => r.id === waiting.id)?.late).toBe(true);
      expect(rows.find((r) => r.id === seatedEarly.id)?.late).toBe(false);

      const noShow = await act(o, waiting.id, 'no-show').expect(200);
      expect(noShow.body).toMatchObject({ status: 'no_show', late: false });
    });

    it('erases guest name, phone and note 30 days after the slot (retention job)', async () => {
      const o = await owner();
      await addTable(o, 'Bàn 1', 4);
      const date = day(2);
      const phone = '0933 444 555';
      const kept = (
        await book(o.slug, { date, time: '12:00', phone, note: 'Gần cửa sổ' }).expect(201)
      ).body as Booked & { endsAt: string };
      const service = t.app.get(BookingService);
      const end = Date.parse(kept.endsAt);

      // 29 days after the slot the data is still kept.
      await service.purgeExpiredPersonalData(new Date(end + 29 * DAY_MS));
      expect((await list(o, date))[0]?.guestPhone).toBe('+84933444555');

      await advanceTo(o, end + 30 * DAY_MS + 60_000);
      const job = t.app.get(RetentionJob);
      expect(await job.run()).toBeGreaterThanOrEqual(1);
      const [erased] = await list(o, date);
      expect(erased).toMatchObject({ guestName: null, guestPhone: null, note: null, partySize: 2 });
      const [row] = await db.select().from(bookings).where(eq(bookings.id, kept.id));
      expect(row?.personalDataErasedAt).not.toBeNull();
      const logged = JSON.stringify(t.logs);
      expect(logged).toContain('booking_personal_data_erased');
      expect(logged).not.toContain('933444555');
      expect(await job.run()).toBe(0);
    });
  });

  describe('roles and tenant isolation', () => {
    it('lets owner, cashier and waiter use the list; the kitchen gets 403', async () => {
      const o = await owner();
      await addTable(o, 'Bàn 1', 4);
      const booked = (await book(o.slug, { date: day(2), time: '12:00' }).expect(201))
        .body as Booked;
      for (const role of ['cashier', 'waiter'] as const) {
        const { body } = await addStaff(t, o.cookie, role);
        const cookie = await loginCookie(t, body.email, STAFF_PASSWORD);
        await http().get('/api/bookings').set('cookie', cookie).expect(200);
      }
      const kitchen = await addStaff(t, o.cookie, 'kitchen');
      const cookie = await loginCookie(t, kitchen.body.email, STAFF_PASSWORD);
      const refused = await http().get('/api/bookings').set('cookie', cookie).expect(403);
      expect(refused.body.code).toBe('FORBIDDEN');
      await http()
        .post(`/api/bookings/${booked.id}/seat`)
        .set('origin', ORIGIN)
        .set('cookie', cookie)
        .expect(403);
      await http().get('/api/bookings').expect(401);
    });

    it('AC3 restaurant A cannot see or act on restaurant B’s bookings or tables (404)', async () => {
      const a = await owner();
      const b = await owner();
      const tableA = await addTable(a, 'Bàn A', 4);
      const tableB = await addTable(b, 'Bàn B', 4);
      const date = day(2);
      const bookingB = (await book(b.slug, { date, time: '12:00' }).expect(201)).body as Booked;
      const bookingA = (await book(a.slug, { date, time: '12:00' }).expect(201)).body as Booked;

      expect((await list(a, date)).map((r) => r.id)).toEqual([bookingA.id]);
      for (const action of ['confirm', 'seat', 'cancel', 'no-show']) {
        const response = await act(a, bookingB.id, action, action === 'confirm' ? {} : undefined);
        expect(response.status).toBe(404);
      }
      await act(a, bookingB.id, 'confirm', { tableId: tableA }).expect(404);
      await act(a, bookingA.id, 'confirm', { tableId: tableB }).expect(404);
      expect((await list(b, date))[0]).toMatchObject({ id: bookingB.id, status: 'pending' });
      await act(a, 'not-a-uuid', 'seat').expect(404);
    });
  });
});
