import { screen, waitFor, within } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { jsonResponse, renderWithApp } from '@/test/render';
import type { GuestMenu } from '@/features/menu/types';
import type { GuestSession, Order } from './api';
import GuestTablePage from './pages/GuestTablePage.vue';

const TOKEN = 'AAAAAAAAAAAAAAAAAAAAAA';
const TABLE = {
  restaurant: { name: 'Quán Ngon', slug: 'quan-ngon' },
  table: { id: 't', name: 'Bàn 3', seats: 4 },
};
const MENU: GuestMenu = {
  restaurant: { name: 'Quán Ngon', slug: 'quan-ngon' },
  categories: [
    {
      id: 'c1',
      name: 'Món chính',
      isMain: true,
      items: [
        { id: 'pho', name: 'Phở bò', priceVnd: 45000, description: null, orderable: true },
        { id: 'bun', name: 'Bún chả', priceVnd: 50000, description: null, orderable: false },
      ],
    },
    {
      id: 'c2',
      name: 'Đồ uống',
      isMain: false,
      items: [{ id: 'tra', name: 'Trà đá', priceVnd: 5000, description: null, orderable: true }],
    },
  ],
};

const order = (over: Partial<Order> = {}): Order => ({
  id: 'o1',
  status: 'released',
  holdReason: null,
  maxMainPerPerson: 2,
  requestedAt: '2026-11-08T12:05:00.000Z',
  totalVnd: 90000,
  items: [
    {
      id: 'i1',
      menuItemId: 'pho',
      name: 'Phở bò',
      priceVnd: 45000,
      quantity: 2,
      note: 'ít hành',
      isMain: true,
      status: 'waiting',
      version: 1,
    },
  ],
  ...over,
});

const session = (orders: Order[] = [], status: 'open' | 'closed' = 'open'): GuestSession => ({
  restaurant: { name: 'Quán Ngon', slug: 'quan-ngon' },
  table: { name: 'Bàn 3', seats: 4 },
  session: { id: 's1', partySize: 2, status, openedAt: '2026-11-08T12:00:00.000Z' },
  orders,
});

type Reply = Response | (() => Response | Promise<Response>);
interface Call {
  key: string;
  body: unknown;
  headers: Record<string, string>;
}

/** Fake API that also records request headers (Idempotency-Key). Lists reply in turn. */
const fakeApi = (routes: Record<string, Reply | Reply[]>) => {
  const calls: Call[] = [];
  const used = new Map<string, number>();
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${input}`;
      calls.push({
        key,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        headers: (init?.headers ?? {}) as Record<string, string>,
      });
      const route = routes[key];
      if (route === undefined) return Promise.resolve(jsonResponse({ code: 'NOT_FOUND' }, 404));
      const index = used.get(key) ?? 0;
      used.set(key, index + 1);
      const reply = Array.isArray(route) ? route[Math.min(index, route.length - 1)] : route;
      if (reply === undefined) throw new Error(`no reply for ${key}`);
      return Promise.resolve(typeof reply === 'function' ? reply() : reply.clone());
    }),
  );
  return calls;
};

class FakeEventSource extends EventTarget {
  static last: FakeEventSource | undefined;
  closed = false;
  constructor(readonly url: string) {
    super();
    FakeEventSource.last = this;
  }
  emit(type: string, data?: unknown) {
    this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data ?? {}) }));
  }
  close() {
    this.closed = true;
  }
}

const CHECK_IN = `GET /api/g/check-in?qr=${TOKEN}`;
const next = (step: 'join' | 'party_size' | 'wait_for_staff') =>
  jsonResponse({ next: step, maxPartySize: 8 });

const joinedRoutes = (extra: Record<string, Reply | Reply[]> = {}) => ({
  [`GET /api/g/t/${TOKEN}`]: jsonResponse(TABLE),
  [CHECK_IN]: next('join'),
  'POST /api/g/session': jsonResponse({ opened: false }),
  'GET /api/g/session': jsonResponse(session()),
  'GET /api/g/menu': jsonResponse(MENU),
  ...extra,
});

const renderGuest = (at = `/t/${TOKEN}`) =>
  renderWithApp(GuestTablePage, { paths: ['/t/:qrToken', '/t/:qrToken/hoa-don'], at });

beforeEach(() => {
  vi.stubGlobal('EventSource', FakeEventSource);
  sessionStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('guest check-in (S6)', () => {
  it('AC17 asks for the party size (1 … seats + 4) and opens the table', async () => {
    const calls = fakeApi({
      [`GET /api/g/t/${TOKEN}`]: jsonResponse(TABLE),
      [CHECK_IN]: next('party_size'),
      'POST /api/g/session': jsonResponse({ opened: true }, 201),
      'GET /api/g/session': jsonResponse(session()),
      'GET /api/g/menu': jsonResponse(MENU),
    });
    await renderGuest();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Chào mừng bạn đến Quán Ngon' }),
    ).toBeTruthy();
    const stepper = screen.getByRole('spinbutton', { name: 'Bàn mình có mấy người?' });
    expect(stepper.getAttribute('aria-valuemax')).toBe('8');
    expect(screen.getByText('Từ 1 đến 8 người. Nhân viên có thể sửa lại sau.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Thêm một người' }));
    await userEvent.click(screen.getByRole('button', { name: 'Bắt đầu gọi món' }));
    // TQR-011: the party-size step comes from GET /api/g/check-in, never from a 409 on load.
    expect(calls.filter((c) => c.key === 'POST /api/g/session').map((c) => c.body)).toEqual([
      { qrToken: TOKEN, partySize: 3 },
    ]);
    expect(await screen.findByRole('heading', { level: 1, name: 'Thực đơn' })).toBeTruthy();
    expect(document.title).toBe('Bàn 3 · Quán Ngon');
  });

  it('shows the field error when the server refuses the party size', async () => {
    fakeApi({
      [`GET /api/g/t/${TOKEN}`]: jsonResponse(TABLE),
      [CHECK_IN]: next('party_size'),
      'POST /api/g/session': jsonResponse(
        { code: 'VALIDATION_FAILED', fields: [{ path: 'partySize' }] },
        422,
      ),
    });
    await renderGuest();
    await userEvent.click(await screen.findByRole('button', { name: 'Bắt đầu gọi món' }));
    expect(await screen.findByText('Số người từ 1 đến 8.')).toBeTruthy();
  });

  it('AC18 a second phone joins straight to the menu without a party size', async () => {
    const calls = fakeApi(joinedRoutes());
    await renderGuest();
    expect(await screen.findByRole('heading', { level: 1, name: 'Thực đơn' })).toBeTruthy();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(calls.find((c) => c.key === 'POST /api/g/session')?.body).toEqual({ qrToken: TOKEN });
  });

  it('AC19 "staff opens": asks to wait and offers no ordering; retry joins once opened', async () => {
    fakeApi({
      [`GET /api/g/t/${TOKEN}`]: jsonResponse(TABLE),
      [CHECK_IN]: [next('wait_for_staff'), next('join')],
      'POST /api/g/session': jsonResponse({ opened: false }),
      'GET /api/g/session': jsonResponse(session()),
      'GET /api/g/menu': jsonResponse(MENU),
    });
    await renderGuest();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Vui lòng chờ nhân viên mở bàn' }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Thêm/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Thực đơn' })).toBeTruthy();
  });

  it.each([
    [jsonResponse({ code: 'QR_EXPIRED' }, 410), 'Mã QR đã hết hạn'],
    [jsonResponse({ code: 'TABLE_NOT_FOUND' }, 404), 'Không tìm thấy bàn'],
  ])(
    'AC10/AC11 an expired or unknown code shows its message and nothing to order',
    async (reply, title) => {
      fakeApi({ [`GET /api/g/t/${TOKEN}`]: reply });
      await renderGuest();
      expect(await screen.findByRole('heading', { level: 1, name: title })).toBeTruthy();
      expect(screen.queryByRole('button')).toBeNull();
    },
  );

  it.each([
    [
      'when the code is resolved',
      { [`GET /api/g/t/${TOKEN}`]: jsonResponse({ code: 'RESTAURANT_SUSPENDED' }, 403) },
    ],
    [
      'at check-in',
      {
        [`GET /api/g/t/${TOKEN}`]: jsonResponse(TABLE),
        [CHECK_IN]: next('join'),
        'POST /api/g/session': jsonResponse({ code: 'RESTAURANT_SUSPENDED' }, 403),
      },
    ],
  ])('AC54 a suspended restaurant says so %s', async (_when, routes) => {
    fakeApi(routes);
    await renderGuest();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Nhà hàng tạm ngưng' }),
    ).toBeTruthy();
  });

  it('offers a retry when the network fails', async () => {
    let fail = true;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string, init?: RequestInit) => {
        if (fail) return Promise.reject(new TypeError('offline'));
        const routes: Record<string, Reply | Reply[]> = joinedRoutes();
        const reply = routes[`${init?.method ?? 'GET'} ${input}`];
        return Promise.resolve((reply as Response).clone());
      }),
    );
    await renderGuest();
    expect(await screen.findByText(/Không mở được bàn/)).toBeTruthy();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Thực đơn' })).toBeTruthy();
  });
});

describe('guest ordering (S7)', () => {
  it('AC22 adds dishes, shows the sticky bar and sends the cart with an Idempotency-Key', async () => {
    const calls = fakeApi(
      joinedRoutes({
        'POST /api/g/orders': jsonResponse(order(), 201),
        'GET /api/g/session': [jsonResponse(session()), jsonResponse(session([order()]))],
      }),
    );
    const { router } = await renderGuest();
    await userEvent.click(await screen.findByRole('button', { name: 'Thêm một Phở bò' }));
    await userEvent.click(screen.getByRole('button', { name: 'Thêm một Phở bò' }));
    expect(screen.getByText('2 trong giỏ')).toBeTruthy();
    // "Hết món" dishes have no order button (AC6).
    expect(screen.queryByRole('button', { name: 'Thêm một Bún chả' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Giỏ hàng (2)' })).toBeTruthy();
    expect(screen.getByText(/90\.000\s₫/u)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Gửi món' }));
    const post = calls.find((c) => c.key === 'POST /api/g/orders');
    expect(post?.body).toEqual({
      lines: [{ menuItemId: 'pho', quantity: 2, priceVnd: 45000, note: null }],
    });
    expect(post?.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByText('Đã gửi món. Bạn theo dõi từng món ở đây.')).toBeTruthy();
    await waitFor(() => expect(router.currentRoute.value.query.xem).toBe('da-goi'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Món đã gọi' })).toBeTruthy();
    const article = screen.getByRole('article');
    expect(within(article).getByText('Đã gửi')).toBeTruthy();
    expect(within(article).getByText('Đang chờ')).toBeTruthy();
    expect(within(article).getByText('ít hành')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Giỏ hàng/ })).toBeNull();
  });

  it('AC22 the cart sheet edits quantities and notes before sending', async () => {
    const calls = fakeApi(joinedRoutes({ 'POST /api/g/orders': jsonResponse(order(), 201) }));
    await renderGuest();
    await userEvent.click(await screen.findByRole('button', { name: 'Thêm một Trà đá' }));
    await userEvent.click(screen.getByRole('button', { name: 'Giỏ hàng (1)' }));
    const sheet = await screen.findByRole('dialog', { name: 'Giỏ hàng' });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Thêm một Trà đá' }));
    await userEvent.type(
      within(sheet).getByLabelText('Ghi chú cho Trà đá (không bắt buộc)'),
      'ít đá',
    );
    await userEvent.click(within(sheet).getByRole('button', { name: 'Gửi món' }));
    expect(calls.find((c) => c.key === 'POST /api/g/orders')?.body).toEqual({
      lines: [{ menuItemId: 'tra', quantity: 2, priceVnd: 5000, note: 'ít đá' }],
    });
  });

  it('AC24 a network failure keeps the cart and the retry reuses the same key', async () => {
    let attempt = 0;
    const calls = fakeApi(
      joinedRoutes({
        'POST /api/g/orders': () => {
          attempt += 1;
          if (attempt === 1) throw new TypeError('offline');
          return jsonResponse(order(), 201);
        },
      }),
    );
    // fetch throwing synchronously inside the mock surfaces as a rejected promise
    await renderGuest();
    await userEvent.click(await screen.findByRole('button', { name: 'Thêm một Phở bò' }));
    await userEvent.click(screen.getByRole('button', { name: 'Gửi món' }));
    const sheet = await screen.findByRole('dialog', { name: 'Giỏ hàng' });
    expect(within(sheet).getByRole('alert').textContent).toContain('mất mạng');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Gửi món' }));
    const keys = calls
      .filter((c) => c.key === 'POST /api/g/orders')
      .map((c) => c.headers['Idempotency-Key']);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('AC25 a changed menu updates the cart, says what changed and shows the current menu', async () => {
    const changed: GuestMenu = {
      ...MENU,
      categories: [
        {
          ...MENU.categories[0]!,
          items: [
            { id: 'pho', name: 'Phở bò', priceVnd: 50000, description: null, orderable: true },
          ],
        },
        {
          ...MENU.categories[1]!,
          items: [
            { id: 'tra', name: 'Trà đá', priceVnd: 5000, description: null, orderable: false },
          ],
        },
      ],
    };
    fakeApi(
      joinedRoutes({
        'GET /api/g/menu': [jsonResponse(MENU), jsonResponse(changed)],
        'POST /api/g/orders': jsonResponse({ code: 'MENU_CHANGED', problems: [] }, 409),
      }),
    );
    await renderGuest();
    await userEvent.click(await screen.findByRole('button', { name: 'Thêm một Phở bò' }));
    await userEvent.click(screen.getByRole('button', { name: 'Thêm một Trà đá' }));
    await userEvent.click(screen.getByRole('button', { name: 'Gửi món' }));
    const sheet = await screen.findByRole('dialog', { name: 'Giỏ hàng' });
    const alert = within(sheet).getByRole('alert').textContent ?? '';
    expect(alert).toContain('Thực đơn vừa thay đổi');
    expect(alert).toMatch(/Phở bò: giá mới 50\.000\s₫/u);
    expect(alert).toContain('Trà đá: đã hết, đã bỏ khỏi giỏ');
    expect(within(sheet).queryByText('Trà đá')).toBeNull();
    expect(screen.getByRole('button', { name: 'Giỏ hàng (1)' })).toBeTruthy();
  });

  it('TQR-012 a phone over its order limit (429 TOO_MANY_ORDERS) keeps the cart and is told to wait', async () => {
    fakeApi(
      joinedRoutes({
        'POST /api/g/orders': jsonResponse({ code: 'TOO_MANY_ORDERS' }, 429),
      }),
    );
    await renderGuest();
    await userEvent.click(await screen.findByRole('button', { name: 'Thêm một Phở bò' }));
    await userEvent.click(screen.getByRole('button', { name: 'Gửi món' }));
    expect(await screen.findByText(/Bạn đã gửi rất nhiều đơn trong ít phút/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Giỏ hàng (1)' })).toBeTruthy();
  });

  it('AC21 a closed session shows "Bàn đã đóng" and no way to order', async () => {
    fakeApi(joinedRoutes({ 'GET /api/g/session': jsonResponse(session([], 'closed')) }));
    await renderGuest();
    expect(await screen.findByRole('heading', { level: 1, name: 'Bàn đã đóng' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Thêm/ })).toBeNull();
  });

  it('keeps the cart across a reload of the page', async () => {
    fakeApi(joinedRoutes());
    const first = await renderGuest();
    await userEvent.click(await screen.findByRole('button', { name: 'Thêm một Phở bò' }));
    first.unmount();
    fakeApi(joinedRoutes());
    await renderGuest();
    expect(await screen.findByRole('button', { name: 'Giỏ hàng (1)' })).toBeTruthy();
  });
});

describe('guest live status (S11)', () => {
  it('AC26 shows why an order is held and AC28 its rejection', async () => {
    fakeApi(
      joinedRoutes({
        'GET /api/g/session': jsonResponse(
          session([
            order({
              status: 'held',
              holdReason: 'anomaly_over',
              items: [{ ...order().items[0]!, status: 'pending' }],
            }),
            order({
              id: 'o2',
              status: 'rejected',
              items: [{ ...order().items[0]!, id: 'i2', status: 'cancelled' }],
            }),
          ]),
        ),
      }),
    );
    await renderGuest(`/t/${TOKEN}?xem=da-goi`);
    // TQR-013: the session total (2 portions of the held order) against the limit (2 × 2).
    expect(
      await screen.findByText(/bàn 2 người đã gọi 2 phần món chính, quá mức thường lệ 4 phần/),
    ).toBeTruthy();
    expect(screen.getAllByText('Chờ xác nhận').length).toBe(2);
    expect(screen.getByText(/Nhân viên đã huỷ đơn này/)).toBeTruthy();
    expect(screen.getAllByText('Đã huỷ').length).toBe(2);
    expect(
      screen.getByRole('button', { name: 'Món đã gọi (2)' }).getAttribute('aria-current'),
    ).toBe('page');
  });

  it('AC38 applies item deltas from the stream and refetches on order changes', async () => {
    const calls = fakeApi(
      joinedRoutes({
        'GET /api/g/session': [
          jsonResponse(session([order()])),
          jsonResponse(
            session([
              order(),
              order({ id: 'o2', status: 'held', holdReason: 'every_order', items: [] }),
            ]),
          ),
        ],
      }),
    );
    await renderGuest(`/t/${TOKEN}?xem=da-goi`);
    expect(await screen.findByText('Đang chờ')).toBeTruthy();
    const stream = FakeEventSource.last;
    if (!stream) throw new Error('no stream');
    expect(stream.url).toBe('/api/g/stream');
    stream.emit('snapshot', session([order()]));
    expect(await screen.findByText('Đang cập nhật trực tiếp')).toBeTruthy();
    stream.emit('delta', {
      topic: 'session:s1',
      type: 'item.status',
      itemId: 'i1',
      status: 'cooking',
      version: 2,
    });
    expect(await screen.findByText('Đang nấu')).toBeTruthy();
    // An older version never wins.
    stream.emit('delta', {
      topic: 'session:s1',
      type: 'item.status',
      itemId: 'i1',
      status: 'waiting',
      version: 1,
    });
    expect(screen.queryByText('Đang chờ')).toBeNull();
    stream.emit('delta', {
      topic: 'session:s1',
      type: 'order.status',
      orderId: 'o2',
      status: 'held',
    });
    expect(
      await screen.findByText('Quán xác nhận mọi đơn trước khi nấu. Nhân viên sẽ xác nhận ngay.'),
    ).toBeTruthy();
    expect(calls.filter((c) => c.key === 'GET /api/g/session')).toHaveLength(2);
  });

  it('TQR-013 a drinks-only order held under "every order" never talks about main dishes', async () => {
    fakeApi(
      joinedRoutes({
        'GET /api/g/session': jsonResponse(
          session([
            order({
              status: 'held',
              holdReason: 'every_order',
              items: [{ ...order().items[0]!, name: 'Trà đá', isMain: false, status: 'pending' }],
            }),
          ]),
        ),
      }),
    );
    await renderGuest(`/t/${TOKEN}?xem=da-goi`);
    expect(
      await screen.findByText('Quán xác nhận mọi đơn trước khi nấu. Nhân viên sẽ xác nhận ngay.'),
    ).toBeTruthy();
    expect(screen.queryByText(/món chính/)).toBeNull();
  });

  it('TQR-016 a pay-before order leaves "Chờ thanh toán" live when the payment releases it', async () => {
    const paying = order({
      status: 'awaiting_payment',
      items: [{ ...order().items[0]!, status: 'pending' }],
    });
    const released = order({ items: [{ ...order().items[0]!, status: 'waiting', version: 2 }] });
    const calls = fakeApi(
      joinedRoutes({
        'GET /api/g/session': [
          jsonResponse(session([paying])),
          jsonResponse(session([paying])),
          jsonResponse(session([released])),
        ],
      }),
    );
    await renderGuest(`/t/${TOKEN}?xem=da-goi`);
    expect(await screen.findByText('Quán nấu sau khi bạn thanh toán.')).toBeTruthy();
    const stream = FakeEventSource.last;
    if (!stream) throw new Error('no stream');
    stream.emit('delta', {
      topic: 'session:s1',
      type: 'item.status',
      itemId: 'i1',
      status: 'waiting',
      version: 2,
    });
    stream.emit('delta', {
      topic: 'session:s1',
      type: 'order.status',
      orderId: 'o1',
      status: 'released',
    });
    // Patched at once: no order-level "Chờ thanh toán" next to dishes that say "Đang chờ".
    await waitFor(() => expect(screen.queryByText('Quán nấu sau khi bạn thanh toán.')).toBeNull());
    expect(screen.getByText('Đã gửi')).toBeTruthy();
    expect(screen.getByText('Đang chờ')).toBeTruthy();
    const before = calls.filter((c) => c.key === 'GET /api/g/session').length;
    stream.emit('delta', {
      topic: 'session:s1',
      type: 'bill.status',
      billId: 'b1',
      status: 'paid',
    });
    await waitFor(() =>
      expect(calls.filter((c) => c.key === 'GET /api/g/session').length).toBeGreaterThan(before),
    );
    expect(screen.queryByText('Chờ thanh toán')).toBeNull();
  });

  it('TQR-018 the guest reaches the bill by tapping: the bottom bar and the pay-before banner', async () => {
    fakeApi(
      joinedRoutes({
        'GET /api/g/session': jsonResponse(
          session([
            order({
              status: 'awaiting_payment',
              items: [{ ...order().items[0]!, status: 'pending' }],
            }),
          ]),
        ),
      }),
    );
    const { router } = await renderGuest(`/t/${TOKEN}?xem=da-goi`);
    const banner = await screen.findByRole('link', { name: 'Xem hoá đơn để thanh toán' });
    expect(banner.getAttribute('href')).toBe(`/t/${TOKEN}/hoa-don`);
    await userEvent.click(screen.getByRole('button', { name: 'Xem hoá đơn / Thanh toán' }));
    await waitFor(() => expect(router.currentRoute.value.path).toBe(`/t/${TOKEN}/hoa-don`));
  });

  it('TQR-018 no bill button before anything is ordered, and the cart bar takes its place', async () => {
    fakeApi(joinedRoutes());
    await renderGuest();
    await screen.findByRole('heading', { level: 1, name: 'Thực đơn' });
    expect(screen.queryByRole('button', { name: 'Xem hoá đơn / Thanh toán' })).toBeNull();
  });

  it('AC39 says it is reconnecting and replaces everything with the next snapshot', async () => {
    fakeApi(joinedRoutes({ 'GET /api/g/session': jsonResponse(session([order()])) }));
    await renderGuest(`/t/${TOKEN}?xem=da-goi`);
    await screen.findByText('Đang chờ');
    const stream = FakeEventSource.last;
    if (!stream) throw new Error('no stream');
    stream.emit('error');
    expect(await screen.findByText('Mất kết nối, đang thử lại…')).toBeTruthy();
    stream.emit(
      'snapshot',
      session([order({ items: [{ ...order().items[0]!, status: 'served', version: 4 }] })]),
    );
    expect(await screen.findByText('Đã ra bàn')).toBeTruthy();
    expect(screen.getByText('Đang cập nhật trực tiếp')).toBeTruthy();
  });

  it('shows an empty orders tab with a way back to the menu', async () => {
    fakeApi(joinedRoutes());
    const { router } = await renderGuest(`/t/${TOKEN}?xem=da-goi`);
    expect(await screen.findByText('Bạn chưa gọi món nào.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Xem thực đơn' }));
    await waitFor(() => expect(router.currentRoute.value.query.xem).toBeUndefined());
  });
});
