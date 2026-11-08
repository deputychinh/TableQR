import request from 'supertest';
import { eq } from 'drizzle-orm';
import { DB, type Database } from '../src/db/database.module.js';
import { categories, menuItems, restaurants, stations, users } from '../src/db/schema.js';
import { hashPassword } from '../src/identity/domain/password.js';
import { createTestApp, type TestApp } from './support/app.js';
import { ORIGIN, cookieOf, newOwner, signUp } from './support/http.js';
import { openSession, releaseOrder } from './support/service-fixtures.js';
import { diningTables } from '../src/tables/tables.schema.js';

type Role = 'cashier' | 'waiter' | 'kitchen';

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('menu: stations, categories, items, availability (e2e)', () => {
  let t: TestApp;
  let staffPasswordHash: string;
  const http = () => request(t.app.getHttpServer());
  const db = () => t.app.get<Database>(DB);

  beforeAll(async () => {
    t = await createTestApp();
    staffPasswordHash = await hashPassword('mat-khau-nhan-vien');
  });

  afterAll(async () => {
    await t.app.close();
  });

  /** A fresh restaurant whose owner has opened the menu once (so the default station exists). */
  const newRestaurant = async (name = 'Quán Menu') => {
    const { cookie, response } = await signUp(t, newOwner(name));
    const menu = await http().get('/api/menu').set('cookie', cookie).expect(200);
    return {
      cookie,
      restaurantId: response.body.restaurant.id as string,
      slug: response.body.restaurant.slug as string,
      stationId: menu.body.stations[0].id as string,
    };
  };

  /** Staff accounts arrive with TQR-005; until then the test inserts the row and signs in. */
  const staffOf = async (restaurantId: string, role: Role): Promise<string> => {
    const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    await db().insert(users).values({ restaurantId, email, role, passwordHash: staffPasswordHash });
    const login = await http()
      .post('/api/auth/login')
      .set('origin', ORIGIN)
      .send({ email, password: 'mat-khau-nhan-vien' })
      .expect(200);
    return cookieOf(login);
  };

  const post = (path: string, cookie: string, body: unknown) =>
    http()
      .post(path)
      .set('origin', ORIGIN)
      .set('cookie', cookie)
      .send(body as object);
  const patch = (path: string, cookie: string, body: unknown) =>
    http()
      .patch(path)
      .set('origin', ORIGIN)
      .set('cookie', cookie)
      .send(body as object);
  const put = (path: string, cookie: string, body: unknown) =>
    http()
      .put(path)
      .set('origin', ORIGIN)
      .set('cookie', cookie)
      .send(body as object);
  const del = (path: string, cookie: string) =>
    http().delete(path).set('origin', ORIGIN).set('cookie', cookie);

  const addCategory = async (cookie: string, name: string, isMain = false) =>
    (await post('/api/menu/categories', cookie, { name, isMain }).expect(201)).body as {
      id: string;
      sortOrder: number;
    };

  const addItem = async (
    r: { cookie: string; stationId: string },
    categoryId: string,
    extra: Record<string, unknown> = {},
  ) =>
    (
      await post('/api/menu/items', r.cookie, {
        name: 'Phở bò',
        priceVnd: 45_000,
        categoryId,
        stationId: r.stationId,
        ...extra,
      }).expect(201)
    ).body as { id: string; available: boolean };

  describe('stations', () => {
    it('gives a new restaurant one default station "Bếp" (15 min) on first open, only once', async () => {
      const { cookie } = await signUp(t, newOwner());
      const [first, second] = await Promise.all([
        http().get('/api/menu').set('cookie', cookie).expect(200),
        http().get('/api/menu').set('cookie', cookie).expect(200),
      ]);
      const again = await http().get('/api/menu').set('cookie', cookie).expect(200);
      expect(again.body.stations).toEqual([
        { id: expect.any(String), name: 'Bếp', lateAfterMinutes: 15 },
      ]);
      expect([first.body.stations.length, second.body.stations.length]).toEqual([1, 1]);
      expect(again.body.categories).toEqual([]);
    });

    it('adds, renames and removes a station; names are unique per restaurant in any case', async () => {
      const r = await newRestaurant();
      const created = await post('/api/menu/stations', r.cookie, {
        name: '  Quầy   bar ',
        lateAfterMinutes: 5,
      }).expect(201);
      expect(created.body).toMatchObject({ name: 'Quầy bar', lateAfterMinutes: 5 });
      const clash = await post('/api/menu/stations', r.cookie, { name: 'QUẦY BAR' }).expect(409);
      expect(clash.body).toMatchObject({
        code: 'NAME_TAKEN',
        fields: [{ path: 'name', code: 'taken' }],
      });
      const renamed = await patch(`/api/menu/stations/${created.body.id}`, r.cookie, {
        name: 'Bếp lạnh',
        lateAfterMinutes: 120,
      }).expect(200);
      expect(renamed.body).toMatchObject({ name: 'Bếp lạnh', lateAfterMinutes: 120 });
      const unchanged = await patch(`/api/menu/stations/${created.body.id}`, r.cookie, {}).expect(
        200,
      );
      expect(unchanged.body.name).toBe('Bếp lạnh');
      await del(`/api/menu/stations/${created.body.id}`, r.cookie).expect(204);
      const menu = await http().get('/api/menu').set('cookie', r.cookie).expect(200);
      expect(menu.body.stations.map((s: { name: string }) => s.name)).toEqual(['Bếp']);
    });

    it('lets the same station name exist in two restaurants', async () => {
      const a = await newRestaurant();
      const b = await newRestaurant();
      await post('/api/menu/stations', a.cookie, { name: 'Bếp nóng' }).expect(201);
      await post('/api/menu/stations', b.cookie, { name: 'Bếp nóng' }).expect(201);
    });

    it.each([
      ['empty name', { name: '  ' }, 'name'],
      ['41-char name', { name: 'a'.repeat(41) }, 'name'],
      ['late after 0 min', { name: 'Bar', lateAfterMinutes: 0 }, 'lateAfterMinutes'],
      ['late after 121 min', { name: 'Bar', lateAfterMinutes: 121 }, 'lateAfterMinutes'],
      ['unknown field', { name: 'Bar', restaurantId: MISSING_ID }, '(body)'],
    ])('refuses a station with %s (422)', async (_label, body, field) => {
      const r = await newRestaurant();
      const response = await post('/api/menu/stations', r.cookie, body).expect(422);
      expect(response.body.fields.map((f: { path: string }) => f.path)).toContain(field);
    });

    it('refuses to delete a station that still has items, or the last one', async () => {
      const r = await newRestaurant();
      const category = await addCategory(r.cookie, 'Món chính', true);
      const bar = await post('/api/menu/stations', r.cookie, { name: 'Bar' }).expect(201);
      await addItem({ cookie: r.cookie, stationId: bar.body.id }, category.id, { name: 'Trà đá' });
      const busy = await del(`/api/menu/stations/${bar.body.id}`, r.cookie).expect(409);
      expect(busy.body.code).toBe('STATION_NOT_EMPTY');
      const last = await http().get('/api/menu').set('cookie', r.cookie).expect(200);
      const empty = await post('/api/menu/stations', r.cookie, { name: 'Tạm' }).expect(201);
      await del(`/api/menu/stations/${empty.body.id}`, r.cookie).expect(204);
      // Move the bar's item away, then the bar can go; the default station is now the last one.
      const itemId = last.body.categories[0].items[0].id as string;
      await patch(`/api/menu/items/${itemId}`, r.cookie, { stationId: r.stationId }).expect(200);
      await del(`/api/menu/stations/${bar.body.id}`, r.cookie).expect(204);
      await del(`/api/menu/items/${itemId}`, r.cookie).expect(204);
      const lastOne = await del(`/api/menu/stations/${r.stationId}`, r.cookie).expect(409);
      expect(lastOne.body.code).toBe('LAST_STATION');
    });
  });

  describe('categories', () => {
    it('adds categories in order, flags the main-dish one and moves them up and down', async () => {
      const r = await newRestaurant();
      const mains = await addCategory(r.cookie, 'Món chính', true);
      const drinks = await addCategory(r.cookie, 'Đồ uống');
      const desserts = await addCategory(r.cookie, 'Tráng miệng');
      expect([mains.sortOrder, drinks.sortOrder, desserts.sortOrder]).toEqual([0, 1, 2]);

      const moved = await post(`/api/menu/categories/${desserts.id}/move`, r.cookie, {
        direction: 'up',
      }).expect(200);
      expect(moved.body.categories.map((c: { name: string }) => c.name)).toEqual([
        'Món chính',
        'Tráng miệng',
        'Đồ uống',
      ]);
      const top = await post(`/api/menu/categories/${mains.id}/move`, r.cookie, {
        direction: 'up',
      }).expect(200);
      expect(top.body.categories[0].name).toBe('Món chính');
      await post(`/api/menu/categories/${mains.id}/move`, r.cookie, { direction: 'down' }).expect(
        200,
      );

      const menu = await http().get('/api/menu').set('cookie', r.cookie).expect(200);
      expect(
        menu.body.categories.map((c: { name: string; isMain: boolean }) => [c.name, c.isMain]),
      ).toEqual([
        ['Tráng miệng', false],
        ['Món chính', true],
        ['Đồ uống', false],
      ]);
    });

    it('creates distinct sort orders for simultaneous additions', async () => {
      const r = await newRestaurant();
      const created = await Promise.all(
        ['A', 'B', 'C', 'D'].map((name) => post('/api/menu/categories', r.cookie, { name })),
      );
      const orders = created.map((c) => c.body.sortOrder as number);
      expect(new Set(orders).size).toBe(4);
    });

    it('renames and toggles the main-dish flag; duplicate names answer 409', async () => {
      const r = await newRestaurant();
      const cat = await addCategory(r.cookie, 'Khai vị');
      await addCategory(r.cookie, 'Lẩu');
      const updated = await patch(`/api/menu/categories/${cat.id}`, r.cookie, {
        name: 'Món khai vị',
        isMain: true,
      }).expect(200);
      expect(updated.body).toMatchObject({ name: 'Món khai vị', isMain: true });
      const same = await patch(`/api/menu/categories/${cat.id}`, r.cookie, {}).expect(200);
      expect(same.body.name).toBe('Món khai vị');
      const clash = await patch(`/api/menu/categories/${cat.id}`, r.cookie, {
        name: 'lẩu',
      }).expect(409);
      expect(clash.body.code).toBe('NAME_TAKEN');
      await post('/api/menu/categories', r.cookie, { name: 'LẨU' }).expect(409);
    });

    it.each([
      ['empty name', { name: '' }],
      ['41-char name', { name: 'a'.repeat(41) }],
      ['isMain as text', { name: 'Món', isMain: 'yes' }],
    ])('refuses a category with %s (422)', async (_label, body) => {
      const r = await newRestaurant();
      const response = await post('/api/menu/categories', r.cookie, body).expect(422);
      expect(response.body.code).toBe('VALIDATION_FAILED');
    });

    it('refuses a bad move direction (422) and accepts a 40-char name', async () => {
      const r = await newRestaurant();
      const cat = await addCategory(r.cookie, 'a'.repeat(40));
      await post(`/api/menu/categories/${cat.id}/move`, r.cookie, { direction: 'left' }).expect(
        422,
      );
    });

    it('refuses to delete a category with items (409 CATEGORY_NOT_EMPTY), deletes an empty one', async () => {
      const r = await newRestaurant();
      const cat = await addCategory(r.cookie, 'Món chính', true);
      await addItem(r, cat.id);
      const response = await del(`/api/menu/categories/${cat.id}`, r.cookie).expect(409);
      expect(response.body).toMatchObject({
        code: 'CATEGORY_NOT_EMPTY',
        detail: 'Nhóm món này còn món. Hãy chuyển hoặc xoá các món trước.',
      });
      const empty = await addCategory(r.cookie, 'Trống');
      await del(`/api/menu/categories/${empty.id}`, r.cookie).expect(204);
      await del(`/api/menu/categories/${empty.id}`, r.cookie).expect(404);
    });
  });

  describe('items', () => {
    it('AC5 a saved item appears on the guest menu under its category', async () => {
      const r = await newRestaurant('Phở Gia Truyền');
      const mains = await addCategory(r.cookie, 'Món chính', true);
      await addCategory(r.cookie, 'Chưa có món');
      const item = await post('/api/menu/items', r.cookie, {
        name: 'Phở bò tái',
        priceVnd: 55_000,
        categoryId: mains.id,
        stationId: r.stationId,
        description: 'Bánh phở, bò tái, hành',
      }).expect(201);
      expect(item.body).toMatchObject({
        name: 'Phở bò tái',
        priceVnd: 55_000,
        categoryId: mains.id,
        stationId: r.stationId,
        description: 'Bánh phở, bò tái, hành',
        available: true,
      });

      const guest = await http().get(`/api/g/r/${r.slug}/menu`).expect(200);
      expect(guest.body).toEqual({
        restaurant: { name: expect.stringContaining('Phở Gia Truyền'), slug: r.slug },
        categories: [
          {
            id: mains.id,
            name: 'Món chính',
            isMain: true,
            items: [
              {
                id: item.body.id,
                name: 'Phở bò tái',
                priceVnd: 55_000,
                description: 'Bánh phở, bò tái, hành',
                orderable: true,
              },
            ],
          },
        ],
      });
    });

    it.each([
      ['999', 999, 'too_small'],
      ['0', 0, 'too_small'],
      ['negative', -1000, 'too_small'],
      ['fractional', 35_000.5, 'invalid_type'],
      ['above the limit', 100_000_001, 'too_big'],
      ['text', '35000', 'invalid_type'],
    ])('AC7 refuses a price that is %s with 422 on priceVnd', async (_label, priceVnd, code) => {
      const r = await newRestaurant();
      const cat = await addCategory(r.cookie, 'Món');
      const response = await post('/api/menu/items', r.cookie, {
        name: 'Cơm rang',
        priceVnd,
        categoryId: cat.id,
        stationId: r.stationId,
      }).expect(422);
      expect(response.body).toMatchObject({
        code: 'VALIDATION_FAILED',
        fields: [{ path: 'priceVnd', code }],
      });
      const menu = await http().get('/api/menu').set('cookie', r.cookie).expect(200);
      expect(menu.body.categories[0].items).toEqual([]);
    });

    it('AC7 accepts the boundary prices 1 000 and 100 000 000', async () => {
      const r = await newRestaurant();
      const cat = await addCategory(r.cookie, 'Món');
      await addItem(r, cat.id, { priceVnd: 1000 });
      const top = await addItem(r, cat.id, { name: 'Tôm hùm', priceVnd: 100_000_000 });
      await patch(`/api/menu/items/${top.id}`, r.cookie, { priceVnd: 100_000_001 }).expect(422);
      await patch(`/api/menu/items/${top.id}`, r.cookie, { priceVnd: 999 }).expect(422);
    });

    it.each([
      ['empty name', { name: ' ' }, 'name'],
      ['81-char name', { name: 'a'.repeat(81) }, 'name'],
      ['201-char description', { description: 'a'.repeat(201) }, 'description'],
      ['missing category', { categoryId: undefined }, 'categoryId'],
      ['bad station id', { stationId: 'not-a-uuid' }, 'stationId'],
    ])('refuses an item with %s (422)', async (_label, extra, field) => {
      const r = await newRestaurant();
      const cat = await addCategory(r.cookie, 'Món');
      const response = await post('/api/menu/items', r.cookie, {
        name: 'Bún chả',
        priceVnd: 40_000,
        categoryId: cat.id,
        stationId: r.stationId,
        ...extra,
      }).expect(422);
      expect(response.body.fields.map((f: { path: string }) => f.path)).toContain(field);
    });

    it('edits an item: name, price, category, station and clears the description', async () => {
      const r = await newRestaurant();
      const a = await addCategory(r.cookie, 'A');
      const b = await addCategory(r.cookie, 'B');
      const bar = await post('/api/menu/stations', r.cookie, { name: 'Bar' }).expect(201);
      const item = await addItem(r, a.id, { description: 'Cũ' });
      const updated = await patch(`/api/menu/items/${item.id}`, r.cookie, {
        name: 'Nước cam',
        priceVnd: 30_000,
        categoryId: b.id,
        stationId: bar.body.id,
        description: '',
      }).expect(200);
      expect(updated.body).toMatchObject({
        name: 'Nước cam',
        priceVnd: 30_000,
        categoryId: b.id,
        stationId: bar.body.id,
        description: null,
      });
    });

    it('AC6 a "hết món" item stays on the guest menu flagged not orderable, and comes back', async () => {
      const r = await newRestaurant();
      const cat = await addCategory(r.cookie, 'Món chính', true);
      const item = await addItem(r, cat.id);
      const off = await put(`/api/menu/items/${item.id}/availability`, r.cookie, {
        available: false,
      }).expect(200);
      expect(off.body.available).toBe(false);
      const guest = await http().get(`/api/g/r/${r.slug}/menu`).expect(200);
      expect(guest.body.categories[0].items[0]).toMatchObject({ id: item.id, orderable: false });
      const staff = await http().get('/api/menu').set('cookie', r.cookie).expect(200);
      expect(staff.body.categories[0].items[0].available).toBe(false);
      await put(`/api/menu/items/${item.id}/availability`, r.cookie, { available: true }).expect(
        200,
      );
      const back = await http().get(`/api/g/r/${r.slug}/menu`).expect(200);
      expect(back.body.categories[0].items[0].orderable).toBe(true);
      await put(`/api/menu/items/${item.id}/availability`, r.cookie, { available: 'no' }).expect(
        422,
      );
    });

    it('deletes an item; a second delete is 404', async () => {
      const r = await newRestaurant();
      const cat = await addCategory(r.cookie, 'Món');
      const item = await addItem(r, cat.id);
      await del(`/api/menu/items/${item.id}`, r.cookie).expect(204);
      await del(`/api/menu/items/${item.id}`, r.cookie).expect(404);
    });

    it('refuses to delete a dish that was ever ordered (409 ITEM_HAS_ORDERS, not 500)', async () => {
      const r = await newRestaurant();
      const cat = await addCategory(r.cookie, 'Món');
      const item = await addItem(r, cat.id);
      const [table] = await db()
        .insert(diningTables)
        .values({
          restaurantId: r.restaurantId,
          name: 'Bàn 1',
          seats: 4,
          qrToken: `qr-m-${Date.now()}`,
        })
        .returning({ id: diningTables.id });
      const session = await openSession(db(), r.restaurantId, table?.id ?? '');
      await releaseOrder(db(), r.restaurantId, session, [
        { dish: { id: item.id, name: 'Phở bò', stationId: r.stationId, priceVnd: 45_000 } },
      ]);
      const response = await del(`/api/menu/items/${item.id}`, r.cookie).expect(409);
      expect(response.body.code).toBe('ITEM_HAS_ORDERS');
      expect(response.body.detail).toMatch(/Ngừng bán/);
      const menu = await http().get('/api/menu').set('cookie', r.cookie).expect(200);
      expect(JSON.stringify(menu.body)).toContain(item.id);
    });

    it('the database refuses an out-of-range price even if the API check were bypassed', async () => {
      const r = await newRestaurant();
      const cat = await addCategory(r.cookie, 'Món');
      const item = await addItem(r, cat.id);
      const { menuItems } = await import('../src/menu/menu.schema.js');
      await expect(
        db().update(menuItems).set({ priceVnd: 0 }).where(eq(menuItems.id, item.id)),
      ).rejects.toThrow();
    });
  });

  describe('caps per restaurant (20 stations, 50 categories, 500 items)', () => {
    const fill = async (
      r: { restaurantId: string; stationId: string },
      kind: string,
      n: number,
    ) => {
      const rows = Array.from({ length: n }, (_, i) => `${kind} ${String(i)}`);
      if (kind === 'station') {
        await db()
          .insert(stations)
          .values(
            rows.map((name) => ({ restaurantId: r.restaurantId, name, lateAfterMinutes: 15 })),
          );
      } else if (kind === 'category') {
        await db()
          .insert(categories)
          .values(
            rows.map((name, i) => ({ restaurantId: r.restaurantId, name, sortOrder: i + 1 })),
          );
      } else {
        const [category] = await db()
          .insert(categories)
          .values({ restaurantId: r.restaurantId, name: 'Nhóm đầy', sortOrder: 999 })
          .returning({ id: categories.id });
        await db()
          .insert(menuItems)
          .values(
            rows.map((name) => ({
              restaurantId: r.restaurantId,
              categoryId: category?.id ?? '',
              stationId: r.stationId,
              name,
              priceVnd: 10000,
            })),
          );
        return category?.id ?? '';
      }
      return '';
    };

    it('refuses the 21st station with 409 STATION_LIMIT_REACHED', async () => {
      const r = await newRestaurant();
      await fill(r, 'station', 18); // + the default station = 19
      await post('/api/menu/stations', r.cookie, { name: 'Khu 20' }).expect(201);
      const refused = await post('/api/menu/stations', r.cookie, { name: 'Khu 21' }).expect(409);
      expect(refused.body.code).toBe('STATION_LIMIT_REACHED');
    });

    it('lets exactly one of two parallel creations take the last category slot', async () => {
      const r = await newRestaurant();
      await fill(r, 'category', 49);
      const results = await Promise.all([
        post('/api/menu/categories', r.cookie, { name: 'Cuối A' }),
        post('/api/menu/categories', r.cookie, { name: 'Cuối B' }),
      ]);
      expect(results.map((x) => x.status).sort((a, b) => a - b)).toEqual([201, 409]);
      expect(results.find((x) => x.status === 409)?.body.code).toBe('CATEGORY_LIMIT_REACHED');
    });

    it('refuses the 501st item with 409 ITEM_LIMIT_REACHED', async () => {
      const r = await newRestaurant();
      const categoryId = await fill(r, 'item', 499);
      const item = (name: string) =>
        post('/api/menu/items', r.cookie, {
          name,
          priceVnd: 20000,
          categoryId,
          stationId: r.stationId,
        });
      await item('Món 500').expect(201);
      const refused = await item('Món 501').expect(409);
      expect(refused.body.code).toBe('ITEM_LIMIT_REACHED');
      const menu = await http().get('/api/menu').set('cookie', r.cookie).expect(200);
      expect(menu.body.categories[0].items).toHaveLength(500);
    });
  });

  describe('guest menu', () => {
    it('answers 404 for an unknown or malformed slug and 403 RESTAURANT_SUSPENDED (AC54) for a suspended restaurant', async () => {
      await http().get('/api/g/r/khong-co-quan-nay/menu').expect(404);
      await http().get('/api/g/r/BAD%20SLUG/menu').expect(404);
      const r = await newRestaurant();
      await db()
        .update(restaurants)
        .set({ status: 'suspended' })
        .where(eq(restaurants.id, r.restaurantId));
      const response = await http().get(`/api/g/r/${r.slug}/menu`).expect(403);
      expect(response.body.code).toBe('RESTAURANT_SUSPENDED');
    });
  });

  describe('roles', () => {
    it('lets cashier, waiter and kitchen read the menu', async () => {
      const r = await newRestaurant();
      for (const role of ['cashier', 'waiter', 'kitchen'] as const) {
        const cookie = await staffOf(r.restaurantId, role);
        const menu = await http().get('/api/menu').set('cookie', cookie).expect(200);
        expect(menu.body.stations).toHaveLength(1);
      }
    });

    it('refuses menu writes from a waiter with 403 and changes nothing', async () => {
      const r = await newRestaurant();
      const cat = await addCategory(r.cookie, 'Món');
      const item = await addItem(r, cat.id);
      const waiter = await staffOf(r.restaurantId, 'waiter');
      const body = { name: 'Lẩu', priceVnd: 200_000, categoryId: cat.id, stationId: r.stationId };
      const refused = await post('/api/menu/items', waiter, body).expect(403);
      expect(refused.body.code).toBe('FORBIDDEN');
      await post('/api/menu/categories', waiter, { name: 'X' }).expect(403);
      await post('/api/menu/stations', waiter, { name: 'X' }).expect(403);
      await patch(`/api/menu/items/${item.id}`, waiter, { priceVnd: 1000 }).expect(403);
      await del(`/api/menu/items/${item.id}`, waiter).expect(403);
      await put(`/api/menu/items/${item.id}/availability`, waiter, { available: false }).expect(
        403,
      );
      const menu = await http().get('/api/menu').set('cookie', r.cookie).expect(200);
      expect(menu.body.categories[0].items).toEqual([
        expect.objectContaining({ id: item.id, priceVnd: 45_000, available: true }),
      ]);
    });

    it('lets the kitchen mark a dish "hết món" but not edit the menu', async () => {
      const r = await newRestaurant();
      const cat = await addCategory(r.cookie, 'Món');
      const item = await addItem(r, cat.id);
      const kitchen = await staffOf(r.restaurantId, 'kitchen');
      await put(`/api/menu/items/${item.id}/availability`, kitchen, { available: false }).expect(
        200,
      );
      await patch(`/api/menu/items/${item.id}`, kitchen, { name: 'Đổi tên' }).expect(403);
      await del(`/api/menu/categories/${cat.id}`, kitchen).expect(403);
      const cashier = await staffOf(r.restaurantId, 'cashier');
      await put(`/api/menu/items/${item.id}/availability`, cashier, { available: true }).expect(
        403,
      );
    });

    it('answers 401 without a session and 403 for a foreign Origin', async () => {
      await http().get('/api/menu').expect(401);
      const r = await newRestaurant();
      await http()
        .post('/api/menu/categories')
        .set('origin', 'https://evil.example')
        .set('cookie', r.cookie)
        .send({ name: 'X' })
        .expect(403);
    });
  });

  describe('tenant isolation (ADR 0003)', () => {
    it('owner A cannot see, change or use any of B’s menu rows (404, B unchanged)', async () => {
      const a = await newRestaurant('Quán A');
      const b = await newRestaurant('Quán B');
      const bCat = await addCategory(b.cookie, 'Món của B');
      const bItem = await addItem(b, bCat.id, { name: 'Món bí mật' });
      const aCat = await addCategory(a.cookie, 'Món của A');

      const menuA = await http().get('/api/menu').set('cookie', a.cookie).expect(200);
      expect(JSON.stringify(menuA.body)).not.toContain('Món bí mật');
      expect(JSON.stringify(menuA.body)).not.toContain(b.stationId);

      await patch(`/api/menu/items/${bItem.id}`, a.cookie, { priceVnd: 1000 }).expect(404);
      await put(`/api/menu/items/${bItem.id}/availability`, a.cookie, {
        available: false,
      }).expect(404);
      await del(`/api/menu/items/${bItem.id}`, a.cookie).expect(404);
      await patch(`/api/menu/categories/${bCat.id}`, a.cookie, { name: 'Bị đổi' }).expect(404);
      await post(`/api/menu/categories/${bCat.id}/move`, a.cookie, { direction: 'up' }).expect(404);
      await del(`/api/menu/categories/${bCat.id}`, a.cookie).expect(404);
      await patch(`/api/menu/stations/${b.stationId}`, a.cookie, { name: 'Bị đổi' }).expect(404);
      await del(`/api/menu/stations/${b.stationId}`, a.cookie).expect(404);

      // A cannot attach an item to B's category or station either (composite keys).
      await post('/api/menu/items', a.cookie, {
        name: 'Lén',
        priceVnd: 10_000,
        categoryId: bCat.id,
        stationId: a.stationId,
      }).expect(404);
      await post('/api/menu/items', a.cookie, {
        name: 'Lén',
        priceVnd: 10_000,
        categoryId: aCat.id,
        stationId: b.stationId,
      }).expect(404);
      const aItem = await addItem(a, aCat.id);
      await patch(`/api/menu/items/${aItem.id}`, a.cookie, { categoryId: bCat.id }).expect(404);

      const menuB = await http().get('/api/menu').set('cookie', b.cookie).expect(200);
      expect(menuB.body.categories).toEqual([
        expect.objectContaining({
          name: 'Món của B',
          items: [
            expect.objectContaining({ name: 'Món bí mật', priceVnd: 45_000, available: true }),
          ],
        }),
      ]);
      expect(menuB.body.stations[0].name).toBe('Bếp');
    });

    it('answers 404 for missing and malformed ids', async () => {
      const r = await newRestaurant();
      await patch(`/api/menu/items/${MISSING_ID}`, r.cookie, { name: 'X' }).expect(404);
      await patch('/api/menu/items/not-a-uuid', r.cookie, { name: 'X' }).expect(404);
      await del(`/api/menu/stations/${MISSING_ID}`, r.cookie).expect(404);
      await patch(`/api/menu/stations/${MISSING_ID}`, r.cookie, { name: 'X' }).expect(404);
      await patch(`/api/menu/categories/${MISSING_ID}`, r.cookie, { name: 'X' }).expect(404);
    });
  });
});
