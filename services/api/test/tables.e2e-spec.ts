import { eq } from 'drizzle-orm';
import request from 'supertest';
import { DB, type Database } from '../src/db/database.module.js';
import { diningTables, restaurants, retiredQrTokens, users } from '../src/db/schema.js';
import { hashPassword } from '../src/identity/domain/password.js';
import { createTestApp, type TestApp } from './support/app.js';
import { ORIGIN, cookieOf, newOwner, signUp } from './support/http.js';

type Role = 'cashier' | 'waiter' | 'kitchen' | 'platform_admin';

interface Owner {
  cookie: string;
  restaurantId: string;
  restaurantName: string;
}

describe('tables and QR codes (e2e)', () => {
  let t: TestApp;
  let db: Database;
  let password: string;
  let passwordHash: string;
  const http = () => request(t.app.getHttpServer());

  const owner = async (name = 'Quán Bàn'): Promise<Owner> => {
    const { cookie, response } = await signUp(t, newOwner(name));
    const restaurant = response.body.restaurant as { id: string; name: string };
    return { cookie, restaurantId: restaurant.id, restaurantName: restaurant.name };
  };

  /** Staff accounts arrive with TQR-005; until then a user row is inserted directly. */
  const staff = async (restaurantId: string | null, role: Role): Promise<string> => {
    const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    await db.insert(users).values({ restaurantId, email, passwordHash, role });
    const response = await http()
      .post('/api/auth/login')
      .set('origin', ORIGIN)
      .send({ email, password })
      .expect(200);
    return cookieOf(response);
  };

  const create = (cookie: string, body: object) =>
    http().post('/api/tables').set('origin', ORIGIN).set('cookie', cookie).send(body);

  const addTable = async (cookie: string, name = 'Bàn 1', seats = 4) => {
    const response = await create(cookie, { name, seats }).expect(201);
    return response.body as { id: string; name: string; seats: number; qrToken: string };
  };

  const guest = (token: string) => http().get(`/api/g/t/${token}`);

  beforeAll(async () => {
    t = await createTestApp();
    db = t.app.get<symbol, Database>(DB);
    password = 'mat-khau-nhan-vien-1';
    passwordHash = await hashPassword(password);
  });

  afterAll(async () => {
    await t.app.close();
  });

  describe('AC8 add a table → its own QR token that opens the guest page', () => {
    it('creates the table with a 128-bit base64url token and lists it', async () => {
      const a = await owner('Phở Bò');
      const response = await create(a.cookie, { name: '  Bàn   1 ', seats: 4 }).expect(201);
      expect(response.body).toMatchObject({ name: 'Bàn 1', seats: 4, qrRotatedAt: null });
      expect(response.body.qrToken).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(response.body.id).toMatch(/^[0-9a-f-]{36}$/);
      const list = await http().get('/api/tables').set('cookie', a.cookie).expect(200);
      expect(list.headers['cache-control']).toBe('no-store');
      expect(list.body.items).toEqual([response.body]);
      const one = await http()
        .get(`/api/tables/${response.body.id as string}`)
        .set('cookie', a.cookie)
        .expect(200);
      expect(one.body).toEqual(response.body);
    });

    it('resolves the token to this restaurant and this table for guests (no sign-in)', async () => {
      const a = await owner('Cơm Tấm');
      const table = await addTable(a.cookie, 'Bàn cửa sổ', 6);
      const response = await guest(table.qrToken).expect(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toEqual({
        restaurant: { name: a.restaurantName, slug: expect.any(String) as string },
        table: { id: table.id, name: 'Bàn cửa sổ', seats: 6 },
      });
    });

    it('gives every table a different token', async () => {
      const a = await owner();
      const tokens = await Promise.all(
        ['A1', 'A2', 'A3', 'A4', 'A5'].map(async (n) => (await addTable(a.cookie, n)).qrToken),
      );
      expect(new Set(tokens).size).toBe(5);
    });

    it('accepts the boundaries: 1- and 30-character names, 1 and 30 seats', async () => {
      const a = await owner();
      await create(a.cookie, { name: 'A', seats: 1 }).expect(201);
      await create(a.cookie, { name: 'à'.repeat(30), seats: 30 }).expect(201);
    });

    it.each([
      ['empty name', { name: '   ', seats: 4 }, 'name'],
      ['31-character name', { name: 'B'.repeat(31), seats: 4 }, 'name'],
      ['0 seats', { name: 'Bàn', seats: 0 }, 'seats'],
      ['31 seats', { name: 'Bàn', seats: 31 }, 'seats'],
      ['fractional seats', { name: 'Bàn', seats: 2.5 }, 'seats'],
      ['seats as a string', { name: 'Bàn', seats: '4' }, 'seats'],
      ['missing seats', { name: 'Bàn' }, 'seats'],
      ['unknown field (restaurantId)', { name: 'Bàn', seats: 4, restaurantId: 'x' }, '(body)'],
      ['unknown field (qrToken)', { name: 'Bàn', seats: 4, qrToken: 'x'.repeat(22) }, '(body)'],
    ])('rejects %s with 422 and the failing field', async (_label, body, field) => {
      const a = await owner();
      const response = await create(a.cookie, body).expect(422);
      expect(response.body.code).toBe('VALIDATION_FAILED');
      expect(response.body.fields.map((f: { path: string }) => f.path)).toContain(field);
      const list = await http().get('/api/tables').set('cookie', a.cookie).expect(200);
      expect(list.body.items).toEqual([]);
    });

    it('refuses a name already used in this restaurant, in any letter case or spacing', async () => {
      const a = await owner();
      await addTable(a.cookie, 'Bàn VIP');
      const response = await create(a.cookie, { name: ' bàn  vip ', seats: 2 }).expect(409);
      expect(response.body).toMatchObject({
        code: 'TABLE_NAME_TAKEN',
        fields: [{ path: 'name', code: 'taken' }],
      });
    });

    it('lets exactly one of two simultaneous adds with the same name win', async () => {
      const a = await owner();
      const results = await Promise.all([
        create(a.cookie, { name: 'Bàn đôi', seats: 2 }),
        create(a.cookie, { name: 'BÀN ĐÔI', seats: 2 }),
      ]);
      expect(results.map((r) => r.status).sort((x, y) => x - y)).toEqual([201, 409]);
    });

    it('lets two restaurants use the same table name', async () => {
      const a = await owner();
      const b = await owner();
      await addTable(a.cookie, 'Bàn 1');
      await addTable(b.cookie, 'Bàn 1');
    });

    it('caps a restaurant at 200 tables', async () => {
      const a = await owner();
      await db.transaction(async (tx) => {
        await tx.insert(diningTables).values(
          Array.from({ length: 200 }, (_, i) => ({
            restaurantId: a.restaurantId,
            name: `T${String(i)}`,
            seats: 2,
            qrToken: `cap${String(i).padStart(19, '0')}`,
          })),
        );
      });
      const response = await create(a.cookie, { name: 'Bàn 201', seats: 2 }).expect(409);
      expect(response.body.code).toBe('TABLE_LIMIT_REACHED');
    });
  });

  describe('edit and delete', () => {
    it('renames and changes seats, keeping the QR token', async () => {
      const a = await owner();
      const table = await addTable(a.cookie, 'Bàn 1', 4);
      const response = await http()
        .patch(`/api/tables/${table.id}`)
        .set('origin', ORIGIN)
        .set('cookie', a.cookie)
        .send({ name: 'Bàn sân vườn', seats: 8 })
        .expect(200);
      expect(response.body).toMatchObject({
        name: 'Bàn sân vườn',
        seats: 8,
        qrToken: table.qrToken,
      });
      await http()
        .patch(`/api/tables/${table.id}`)
        .set('origin', ORIGIN)
        .set('cookie', a.cookie)
        .send({ seats: 2 })
        .expect(200);
      const guestView = await guest(table.qrToken).expect(200);
      expect(guestView.body.table).toMatchObject({ name: 'Bàn sân vườn', seats: 2 });
    });

    it.each([
      ['an empty patch', {}],
      ['31 seats', { seats: 31 }],
      ['an unknown field', { qrToken: 'x' }],
    ])('rejects %s with 422', async (_label, body) => {
      const a = await owner();
      const table = await addTable(a.cookie);
      await http()
        .patch(`/api/tables/${table.id}`)
        .set('origin', ORIGIN)
        .set('cookie', a.cookie)
        .send(body)
        .expect(422);
    });

    it('refuses renaming onto another table’s name', async () => {
      const a = await owner();
      await addTable(a.cookie, 'Bàn 1');
      const second = await addTable(a.cookie, 'Bàn 2');
      const response = await http()
        .patch(`/api/tables/${second.id}`)
        .set('origin', ORIGIN)
        .set('cookie', a.cookie)
        .send({ name: 'BÀN 1' })
        .expect(409);
      expect(response.body.code).toBe('TABLE_NAME_TAKEN');
    });

    it('deletes a table; its QR code then shows "not found"', async () => {
      const a = await owner();
      const table = await addTable(a.cookie);
      await http()
        .delete(`/api/tables/${table.id}`)
        .set('origin', ORIGIN)
        .set('cookie', a.cookie)
        .expect(204);
      await http().get(`/api/tables/${table.id}`).set('cookie', a.cookie).expect(404);
      await http()
        .delete(`/api/tables/${table.id}`)
        .set('origin', ORIGIN)
        .set('cookie', a.cookie)
        .expect(404);
      const response = await guest(table.qrToken).expect(404);
      expect(response.body.code).toBe('TABLE_NOT_FOUND');
    });

    it('answers 404 (not 500) for an id that is not a UUID', async () => {
      const a = await owner();
      await http().get('/api/tables/not-a-uuid').set('cookie', a.cookie).expect(404);
      await http()
        .patch('/api/tables/not-a-uuid')
        .set('origin', ORIGIN)
        .set('cookie', a.cookie)
        .send({ seats: 2 })
        .expect(404);
      await http()
        .delete('/api/tables/not-a-uuid')
        .set('origin', ORIGIN)
        .set('cookie', a.cookie)
        .expect(404);
      await http()
        .post('/api/tables/not-a-uuid/rotate-qr')
        .set('origin', ORIGIN)
        .set('cookie', a.cookie)
        .expect(404);
    });
  });

  describe('AC10 regenerate a QR code', () => {
    it('issues a new token; the old one answers 410 "Mã QR đã hết hạn", the new one works', async () => {
      const a = await owner();
      const table = await addTable(a.cookie, 'Bàn 5');
      t.clock.advance(60_000);
      const rotated = await http()
        .post(`/api/tables/${table.id}/rotate-qr`)
        .set('origin', ORIGIN)
        .set('cookie', a.cookie)
        .expect(200);
      expect(rotated.body.qrToken).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(rotated.body.qrToken).not.toBe(table.qrToken);
      expect(rotated.body.qrRotatedAt).toEqual(expect.any(String));
      expect(rotated.body).toMatchObject({ id: table.id, name: 'Bàn 5', seats: 4 });

      const old = await guest(table.qrToken).expect(410);
      expect(old.body).toMatchObject({ code: 'QR_EXPIRED', detail: 'Mã QR đã hết hạn' });
      expect(JSON.stringify(old.body)).not.toContain(a.restaurantName);
      await guest(rotated.body.qrToken as string).expect(200);
    });

    it('keeps every earlier token expired after several rotations', async () => {
      const a = await owner();
      const table = await addTable(a.cookie);
      const tokens = [table.qrToken];
      for (let i = 0; i < 3; i += 1) {
        const rotated = await http()
          .post(`/api/tables/${table.id}/rotate-qr`)
          .set('origin', ORIGIN)
          .set('cookie', a.cookie)
          .expect(200);
        tokens.push(rotated.body.qrToken as string);
      }
      for (const old of tokens.slice(0, -1)) await guest(old).expect(410);
      await guest(tokens.at(-1) ?? '').expect(200);
      const retired = await db
        .select()
        .from(retiredQrTokens)
        .where(eq(retiredQrTokens.tableId, table.id));
      expect(retired).toHaveLength(3);
    });
  });

  describe('AC11 unknown code', () => {
    it.each([
      ['a well-formed token nobody has', 'AAAAAAAAAAAAAAAAAAAAAA'],
      ['a malformed token', 'not-a-token'],
      ['an overlong token', 'A'.repeat(500)],
    ])('answers 404 TABLE_NOT_FOUND for %s', async (_label, token) => {
      const response = await guest(token).expect(404);
      expect(response.body).toMatchObject({
        code: 'TABLE_NOT_FOUND',
        detail: 'Không tìm thấy bàn',
      });
    });

    it('AC54 answers 403 RESTAURANT_SUSPENDED for current and old codes of a suspended restaurant', async () => {
      const a = await owner();
      const table = await addTable(a.cookie);
      const rotated = await http()
        .post(`/api/tables/${table.id}/rotate-qr`)
        .set('origin', ORIGIN)
        .set('cookie', a.cookie)
        .expect(200);
      await db
        .update(restaurants)
        .set({ status: 'suspended' })
        .where(eq(restaurants.id, a.restaurantId));
      for (const token of [rotated.body.qrToken as string, table.qrToken]) {
        const response = await guest(token).expect(403);
        expect(response.body).toMatchObject({
          code: 'RESTAURANT_SUSPENDED',
          detail: 'Nhà hàng tạm ngưng',
        });
      }
    });
  });

  describe('roles (owner writes; cashier and waiter read; kitchen nothing)', () => {
    it.each(['cashier', 'waiter'] as const)(
      '%s can list and read but not change tables',
      async (role) => {
        const a = await owner();
        const table = await addTable(a.cookie);
        const cookie = await staff(a.restaurantId, role);
        const list = await http().get('/api/tables').set('cookie', cookie).expect(200);
        expect(list.body.items).toHaveLength(1);
        await http().get(`/api/tables/${table.id}`).set('cookie', cookie).expect(200);
        await create(cookie, { name: 'Bàn mới', seats: 2 }).expect(403);
        await http()
          .patch(`/api/tables/${table.id}`)
          .set('origin', ORIGIN)
          .set('cookie', cookie)
          .send({ seats: 2 })
          .expect(403);
        await http()
          .post(`/api/tables/${table.id}/rotate-qr`)
          .set('origin', ORIGIN)
          .set('cookie', cookie)
          .expect(403);
        await http()
          .delete(`/api/tables/${table.id}`)
          .set('origin', ORIGIN)
          .set('cookie', cookie)
          .expect(403);
      },
    );

    it('kitchen cannot create (403) nor list tables', async () => {
      const a = await owner();
      const cookie = await staff(a.restaurantId, 'kitchen');
      const response = await create(cookie, { name: 'Bàn bếp', seats: 2 }).expect(403);
      expect(response.body.code).toBe('FORBIDDEN');
      await http().get('/api/tables').set('cookie', cookie).expect(403);
    });

    it('a platform admin (no restaurant) is refused', async () => {
      const cookie = await staff(null, 'platform_admin');
      await http().get('/api/tables').set('cookie', cookie).expect(403);
    });

    it('no session → 401; a foreign Origin → 403 BAD_ORIGIN and nothing created', async () => {
      await http().get('/api/tables').expect(401);
      await http()
        .post('/api/tables')
        .set('origin', ORIGIN)
        .send({ name: 'X', seats: 2 })
        .expect(401);
      const a = await owner();
      const response = await http()
        .post('/api/tables')
        .set('origin', 'https://evil.example')
        .set('cookie', a.cookie)
        .send({ name: 'X', seats: 2 })
        .expect(403);
      expect(response.body.code).toBe('BAD_ORIGIN');
      const list = await http().get('/api/tables').set('cookie', a.cookie).expect(200);
      expect(list.body.items).toEqual([]);
    });
  });

  describe('tenant isolation (ADR 0003)', () => {
    it('owner A cannot read, change, rotate or delete B’s table (404) and B’s table is unchanged', async () => {
      const a = await owner('Quán A');
      const b = await owner('Quán B');
      const tableOfB = await addTable(b.cookie, 'Bàn của B', 4);
      await addTable(a.cookie, 'Bàn của A', 2);

      const listA = await http().get('/api/tables').set('cookie', a.cookie).expect(200);
      expect(listA.body.items.map((x: { name: string }) => x.name)).toEqual(['Bàn của A']);
      await http().get(`/api/tables/${tableOfB.id}`).set('cookie', a.cookie).expect(404);
      await http()
        .patch(`/api/tables/${tableOfB.id}`)
        .set('origin', ORIGIN)
        .set('cookie', a.cookie)
        .send({ name: 'Bị đổi', seats: 30 })
        .expect(404);
      await http()
        .post(`/api/tables/${tableOfB.id}/rotate-qr`)
        .set('origin', ORIGIN)
        .set('cookie', a.cookie)
        .expect(404);
      await http()
        .delete(`/api/tables/${tableOfB.id}`)
        .set('origin', ORIGIN)
        .set('cookie', a.cookie)
        .expect(404);

      const stillB = await http()
        .get(`/api/tables/${tableOfB.id}`)
        .set('cookie', b.cookie)
        .expect(200);
      expect(stillB.body).toEqual(
        expect.objectContaining({ name: 'Bàn của B', seats: 4, qrToken: tableOfB.qrToken }),
      );
      await guest(tableOfB.qrToken).expect(200);
    });

    it('the guest view of A’s code never shows B’s restaurant', async () => {
      const a = await owner('Quán A');
      const b = await owner('Quán B');
      const tableOfA = await addTable(a.cookie, 'Bàn 1');
      await addTable(b.cookie, 'Bàn 1');
      const response = await guest(tableOfA.qrToken).expect(200);
      expect(response.body.restaurant.name).toBe(a.restaurantName);
      expect(response.body.table.id).toBe(tableOfA.id);
    });
  });

  it('never logs QR tokens (route pattern only)', async () => {
    const a = await owner();
    const table = await addTable(a.cookie);
    await guest(table.qrToken).expect(200);
    expect(JSON.stringify(t.logs)).not.toContain(table.qrToken);
    expect(t.logs.some((entry) => entry.route === '/api/g/t/:qrToken')).toBe(true);
  });
});
