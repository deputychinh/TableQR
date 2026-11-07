import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DEFAULT_RULES, type HouseRules } from '../../src/settings/domain/house-rules.js';
import type { TestApp } from './app.js';
import { ORIGIN, signUp } from './http.js';

/**
 * Service-floor fixtures (TQR-011…016): a restaurant with a menu (two main dishes on the default
 * station, a drink on a bar station, a sold-out dish) and a table, plus guest-phone helpers.
 */
export interface FloorRestaurant {
  ownerCookie: string;
  restaurantId: string;
  slug: string;
  tableId: string;
  qrToken: string;
  seats: number;
  stationId: string;
  barStationId: string;
  items: {
    pho: { id: string; priceVnd: number };
    com: { id: string; priceVnd: number };
    tra: { id: string; priceVnd: number };
    soldOut: { id: string; priceVnd: number };
  };
}

export interface GuestPhone {
  cookie: string;
}

export interface OrderLineInput {
  menuItemId: string;
  quantity: number;
  priceVnd: number;
  note?: string | null;
}

export const guestCookieOf = (response: request.Response): string | undefined => {
  const raw = response.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith('tqr_guest='))?.split(';')[0];
};

export const setRules = async (
  t: TestApp,
  ownerCookie: string,
  patch: (rules: HouseRules) => void,
): Promise<void> => {
  const rules = structuredClone(DEFAULT_RULES) as HouseRules;
  patch(rules);
  await request(t.app.getHttpServer())
    .put('/api/restaurant/settings')
    .set('origin', ORIGIN)
    .set('cookie', ownerCookie)
    .send({ rules, bank: null })
    .expect(200);
};

export const setupFloor = async (t: TestApp, seats = 4): Promise<FloorRestaurant> => {
  const http = () => request(t.app.getHttpServer());
  const owner = await signUp(t);
  const cookie = owner.cookie;
  const post = async (path: string, body: object) =>
    (await http().post(path).set('origin', ORIGIN).set('cookie', cookie).send(body).expect(201))
      .body as Record<string, unknown>;
  const menu = (await http().get('/api/menu').set('cookie', cookie).expect(200)).body as {
    stations: { id: string }[];
  };
  const stationId = menu.stations[0]?.id ?? '';
  const bar = await post('/api/menu/stations', { name: 'Quầy bar' });
  const main = await post('/api/menu/categories', { name: 'Món chính', isMain: true });
  const drinks = await post('/api/menu/categories', { name: 'Đồ uống', isMain: false });
  const item = async (name: string, priceVnd: number, categoryId: unknown, station: unknown) => ({
    id: (await post('/api/menu/items', { name, priceVnd, categoryId, stationId: station }))
      .id as string,
    priceVnd,
  });
  const pho = await item('Phở bò', 45000, main.id, stationId);
  const com = await item('Cơm tấm', 40000, main.id, stationId);
  const tra = await item('Trà đá', 5000, drinks.id, bar.id);
  const soldOut = await item('Bún chả', 50000, main.id, stationId);
  await http()
    .put(`/api/menu/items/${soldOut.id}/availability`)
    .set('origin', ORIGIN)
    .set('cookie', cookie)
    .send({ available: false })
    .expect(200);
  const table = await post('/api/tables', { name: 'Bàn 1', seats });
  const restaurant = owner.response.body.restaurant as { id: string; slug: string };
  return {
    ownerCookie: cookie,
    restaurantId: restaurant.id,
    slug: restaurant.slug,
    tableId: table.id as string,
    qrToken: table.qrToken as string,
    seats,
    stationId,
    barStationId: bar.id as string,
    items: { pho, com, tra, soldOut },
  };
};

export const checkIn = (t: TestApp, qrToken: string, partySize?: number, cookie?: string) => {
  const call = request(t.app.getHttpServer()).post('/api/g/session').set('origin', ORIGIN);
  if (cookie) void call.set('cookie', cookie);
  return call.send(partySize === undefined ? { qrToken } : { qrToken, partySize });
};

/** A phone that scanned the table and is now in its session (opening it when needed). */
export const joinPhone = async (
  t: TestApp,
  floor: FloorRestaurant,
  partySize?: number,
): Promise<GuestPhone> => {
  const response = await checkIn(t, floor.qrToken, partySize);
  if (response.status >= 300) throw new Error(`check-in failed: ${String(response.status)}`);
  const cookie = guestCookieOf(response);
  if (!cookie) throw new Error('no tqr_guest cookie');
  return { cookie };
};

export const placeOrder = (
  t: TestApp,
  phone: GuestPhone,
  lines: OrderLineInput[],
  key: string = randomUUID(),
) =>
  request(t.app.getHttpServer())
    .post('/api/g/orders')
    .set('origin', ORIGIN)
    .set('cookie', phone.cookie)
    .set('idempotency-key', key)
    .send({ lines });

export const line = (
  item: { id: string; priceVnd: number },
  quantity = 1,
  note?: string,
): OrderLineInput => ({
  menuItemId: item.id,
  quantity,
  priceVnd: item.priceVnd,
  ...(note === undefined ? {} : { note }),
});
