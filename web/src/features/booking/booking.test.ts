import { screen, waitFor, within } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { jsonResponse, renderWithApp } from '@/test/render';
import { useSessionStore, type StaffRole } from '@/stores/session';
import type { Booking, SlotsView } from './api';
import GuestBookingPage from './pages/GuestBookingPage.vue';
import BookingsPage from './pages/BookingsPage.vue';
import {
  formatClock,
  formatDay,
  formatPhone,
  isIsoDate,
  isVnMobile,
  restaurantToday,
  shiftDate,
} from './time';

interface Call {
  method: string;
  path: string;
  body: unknown;
  headers: Record<string, string>;
}
type Handler = (call: Call) => Response | Promise<Response>;

/** Fake API keyed by `METHOD /api/path` (query string ignored); unknown calls fail the test. */
const fakeApi = (routes: Record<string, Handler>) => {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<(input: string, init?: RequestInit) => Promise<Response>>((input, init) => {
      const call: Call = {
        method: init?.method ?? 'GET',
        path: String(input),
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
        headers: (init?.headers ?? {}) as Record<string, string>,
      };
      calls.push(call);
      const handler = routes[`${call.method} ${call.path.split('?')[0] ?? ''}`];
      if (!handler) throw new Error(`unexpected ${call.method} ${call.path}`);
      return Promise.resolve(handler(call));
    }),
  );
  return calls;
};

const TODAY = restaurantToday();

const slots = (over: Partial<SlotsView> = {}): SlotsView => ({
  restaurant: { name: 'Quán Ngon', slug: 'quan-ngon' },
  date: TODAY,
  enabled: true,
  slotMinutes: 90,
  times: [
    { time: '18:00', free: false },
    { time: '18:30', free: true },
    { time: '19:00', free: true },
  ],
  ...over,
});

const guestBooking = {
  id: 'b1',
  status: 'pending',
  date: '2026-11-20',
  time: '18:30',
  partySize: 2,
  startsAt: '2026-11-20T11:30:00.000Z',
  endsAt: '2026-11-20T13:00:00.000Z',
};

const renderGuest = () =>
  renderWithApp(GuestBookingPage, {
    paths: ['/r/:slug/dat-ban'],
    at: '/r/quan-ngon/dat-ban',
  });

const fillGuest = async (phone = '0912 345 678') => {
  await userEvent.type(screen.getByLabelText('Họ và tên'), 'Nguyễn Văn An');
  await userEvent.type(screen.getByLabelText('Số điện thoại'), phone);
};

afterEach(() => vi.unstubAllGlobals());

describe('booking time and phone helpers', () => {
  it('works in Vietnam time whatever the device zone is', () => {
    expect(restaurantToday(new Date('2026-11-19T17:30:00Z'))).toBe('2026-11-20');
    expect(formatClock('2026-11-20T11:30:00.000Z')).toBe('18:30');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(formatDay('2026-11-20')).toMatch(/20\/11\/2026/u);
    expect(isIsoDate('2026-11-20')).toBe(true);
    expect(isIsoDate('')).toBe(false);
  });

  it('accepts Vietnamese mobiles in every common spelling, like the API', () => {
    for (const ok of ['0912345678', '0912 345 678', '+84 912 345 678', '84912345678']) {
      expect(isVnMobile(ok)).toBe(true);
    }
    for (const bad of ['0212345678', '091234567', '+1 912 345 678', 'abc']) {
      expect(isVnMobile(bad)).toBe(false);
    }
    expect(formatPhone('+84912345678')).toBe('0912 345 678');
  });
});

describe('guest booking page', () => {
  it('AC48 books a free time and shows "Chờ duyệt", sending an Idempotency-Key', async () => {
    const calls = fakeApi({
      'GET /api/g/r/quan-ngon/slots': () => jsonResponse(slots()),
      'POST /api/g/r/quan-ngon/bookings': () => jsonResponse(guestBooking, 201),
    });
    await renderGuest();
    expect(await screen.findByRole('heading', { name: 'Đặt bàn tại Quán Ngon' })).toBeTruthy();
    const time = screen.getByLabelText<HTMLSelectElement>('Giờ đến');
    expect([...time.options].map((o) => o.value)).toEqual(['18:30', '19:00']);
    await userEvent.selectOptions(time, '19:00');
    await fillGuest();
    await userEvent.type(screen.getByLabelText('Ghi chú cho quán (không bắt buộc)'), 'Có trẻ nhỏ');
    await userEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu đặt bàn' }));

    expect(await screen.findByRole('heading', { name: 'Đã gửi yêu cầu đặt bàn' })).toBeTruthy();
    expect(screen.getByText('Chờ duyệt')).toBeTruthy();
    expect(screen.getByText('2 khách')).toBeTruthy();
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.body).toEqual({
      date: TODAY,
      time: '19:00',
      partySize: 2,
      name: 'Nguyễn Văn An',
      phone: '0912 345 678',
      note: 'Có trẻ nhỏ',
    });
    expect(post?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/u);
    expect(calls[0]?.path).toBe(`/api/g/r/quan-ngon/slots?date=${TODAY}&party=2`);

    await userEvent.click(screen.getByRole('button', { name: 'Đặt thêm bàn khác' }));
    expect(await screen.findByRole('button', { name: 'Gửi yêu cầu đặt bàn' })).toBeTruthy();
  });

  it('asks for slots again when the party size changes', async () => {
    const calls = fakeApi({ 'GET /api/g/r/quan-ngon/slots': () => jsonResponse(slots()) });
    await renderGuest();
    await screen.findByLabelText('Giờ đến');
    await userEvent.click(screen.getByRole('button', { name: 'Thêm một khách' }));
    await waitFor(() =>
      expect(calls.at(-1)?.path).toBe(`/api/g/r/quan-ngon/slots?date=${TODAY}&party=3`),
    );
  });

  it('TQR-020 keeps the chosen time when the party size changes and it is still free', async () => {
    fakeApi({ 'GET /api/g/r/quan-ngon/slots': () => jsonResponse(slots()) });
    await renderGuest();
    const time = await screen.findByLabelText<HTMLSelectElement>('Giờ đến');
    await userEvent.selectOptions(time, '19:00');
    await userEvent.click(screen.getByRole('button', { name: 'Thêm một khách' }));
    await waitFor(() => expect(screen.queryByText('Đang xem giờ còn trống…')).toBeNull());
    const after = await screen.findByLabelText<HTMLSelectElement>('Giờ đến');
    expect(after.value).toBe('19:00');
    expect(screen.queryByText(/không còn bàn/u)).toBeNull();
  });

  it('TQR-020 never swaps a chosen time silently: says it is gone and asks for a new one', async () => {
    const calls = fakeApi({
      'GET /api/g/r/quan-ngon/slots': (call) =>
        jsonResponse(
          call.path.endsWith('party=3')
            ? slots({
                times: [
                  { time: '18:30', free: true },
                  { time: '19:00', free: false },
                ],
              })
            : slots(),
        ),
      'POST /api/g/r/quan-ngon/bookings': () => jsonResponse(guestBooking, 201),
    });
    await renderGuest();
    const time = await screen.findByLabelText<HTMLSelectElement>('Giờ đến');
    await userEvent.selectOptions(time, '19:00');
    await userEvent.click(screen.getByRole('button', { name: 'Thêm một khách' }));
    expect(
      await screen.findByText('Giờ 19:00 không còn bàn cho 3 khách. Hãy chọn giờ khác.'),
    ).toBeTruthy();
    const after = screen.getByLabelText<HTMLSelectElement>('Giờ đến');
    expect(after.value).toBe('');
    expect([...after.options].map((o) => o.value)).toEqual(['', '18:30']);
    await fillGuest();
    await userEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu đặt bàn' }));
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    expect(await screen.findByText('Chọn giờ đến.')).toBeTruthy();
    await userEvent.selectOptions(after, '18:30');
    await userEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu đặt bàn' }));
    expect(await screen.findByRole('heading', { name: 'Đã gửi yêu cầu đặt bàn' })).toBeTruthy();
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({
      time: '18:30',
      partySize: 3,
    });
  });

  it('TQR-020 says plainly when this address sent too many booking requests (429)', async () => {
    fakeApi({
      'GET /api/g/r/quan-ngon/slots': () => jsonResponse(slots()),
      'POST /api/g/r/quan-ngon/bookings': () => jsonResponse({ code: 'TOO_MANY_REQUESTS' }, 429),
    });
    await renderGuest();
    await screen.findByLabelText('Giờ đến');
    await fillGuest();
    await userEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu đặt bàn' }));
    expect(await screen.findByText(/Bạn đã gửi nhiều yêu cầu đặt bàn/u)).toBeTruthy();
  });

  it('checks name and phone before sending and focuses the first wrong field', async () => {
    const calls = fakeApi({ 'GET /api/g/r/quan-ngon/slots': () => jsonResponse(slots()) });
    await renderGuest();
    await screen.findByLabelText('Giờ đến');
    await userEvent.type(screen.getByLabelText('Số điện thoại'), '0212345678');
    await userEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu đặt bàn' }));
    expect(await screen.findByText('Nhập họ tên từ 2 đến 60 ký tự.')).toBeTruthy();
    expect(screen.getByText(/Nhập số di động Việt Nam 10 số/u)).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Họ và tên')));
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('AC48 offers the nearest free times when the table was just taken', async () => {
    fakeApi({
      'GET /api/g/r/quan-ngon/slots': () => jsonResponse(slots()),
      'POST /api/g/r/quan-ngon/bookings': () =>
        jsonResponse(
          {
            code: 'NO_TABLE_FREE',
            nearest: [
              { date: TODAY, time: '18:30' },
              { date: TODAY, time: '19:00' },
            ],
          },
          409,
        ),
    });
    await renderGuest();
    await screen.findByLabelText('Giờ đến');
    await fillGuest();
    await userEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu đặt bàn' }));
    expect(await screen.findByText(/Giờ này vừa hết bàn cho 2 khách/u)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Chọn 19:00' }));
    expect(screen.getByLabelText<HTMLSelectElement>('Giờ đến').value).toBe('19:00');
    expect(screen.queryByRole('button', { name: 'Chọn 18:30' })).toBeNull();
  });

  it('says the day is full when no other time is free', async () => {
    fakeApi({
      'GET /api/g/r/quan-ngon/slots': () => jsonResponse(slots()),
      'POST /api/g/r/quan-ngon/bookings': () =>
        jsonResponse({ code: 'NO_TABLE_FREE', nearest: [] }, 409),
    });
    await renderGuest();
    await screen.findByLabelText('Giờ đến');
    await fillGuest();
    await userEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu đặt bàn' }));
    expect(await screen.findByText(/Ngày này đã kín chỗ/u)).toBeTruthy();
  });

  it.each([
    ['past', 'Giờ này đã qua. Hãy chọn giờ khác.'],
    ['outside_hours', 'Giờ này ngoài giờ mở cửa. Hãy chọn giờ khác.'],
    ['closed_day', 'Quán nghỉ ngày này. Hãy chọn ngày khác.'],
    ['mystery', 'Có lỗi xảy ra. Vui lòng thử lại.'],
  ])('AC49 explains a refusal for reason %s', async (reason, message) => {
    fakeApi({
      'GET /api/g/r/quan-ngon/slots': () => jsonResponse(slots()),
      'POST /api/g/r/quan-ngon/bookings': () =>
        jsonResponse({ code: 'BOOKING_NOT_ALLOWED', reason }, 422),
    });
    await renderGuest();
    await screen.findByLabelText('Giờ đến');
    await fillGuest();
    await userEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu đặt bàn' }));
    expect(await screen.findByText(message)).toBeTruthy();
  });

  it('keeps the same Idempotency-Key when retrying after a network failure', async () => {
    let attempt = 0;
    const calls = fakeApi({
      'GET /api/g/r/quan-ngon/slots': () => jsonResponse(slots()),
      'POST /api/g/r/quan-ngon/bookings': () => {
        attempt += 1;
        if (attempt === 1) throw new TypeError('offline');
        return jsonResponse(guestBooking, 201);
      },
    });
    await renderGuest();
    await screen.findByLabelText('Giờ đến');
    await fillGuest();
    await userEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu đặt bàn' }));
    expect(await screen.findByText(/bạn sẽ không bị đặt trùng/u)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu đặt bàn' }));
    await screen.findByRole('heading', { name: 'Đã gửi yêu cầu đặt bàn' });
    const keys = calls.filter((c) => c.method === 'POST').map((c) => c.headers['idempotency-key']);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('uses a new Idempotency-Key when the guest changes the form after a network failure', async () => {
    let attempt = 0;
    const calls = fakeApi({
      'GET /api/g/r/quan-ngon/slots': () => jsonResponse(slots()),
      'POST /api/g/r/quan-ngon/bookings': () => {
        attempt += 1;
        if (attempt === 1) throw new TypeError('offline');
        return jsonResponse(guestBooking, 201);
      },
    });
    await renderGuest();
    await screen.findByLabelText('Giờ đến');
    await fillGuest();
    await userEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu đặt bàn' }));
    await screen.findByText(/bạn sẽ không bị đặt trùng/u);
    await userEvent.selectOptions(screen.getByLabelText('Giờ đến'), '19:00');
    await userEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu đặt bàn' }));
    await screen.findByRole('heading', { name: 'Đã gửi yêu cầu đặt bàn' });
    const keys = calls.filter((c) => c.method === 'POST').map((c) => c.headers['idempotency-key']);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('maps server field errors and the 5-per-day limit to plain messages', async () => {
    let reply = jsonResponse(
      { code: 'VALIDATION_FAILED', fields: [{ path: 'phone', code: 'custom' }] },
      422,
    );
    fakeApi({
      'GET /api/g/r/quan-ngon/slots': () => jsonResponse(slots()),
      'POST /api/g/r/quan-ngon/bookings': () => reply,
    });
    await renderGuest();
    await screen.findByLabelText('Giờ đến');
    await fillGuest();
    await userEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu đặt bàn' }));
    expect(await screen.findByText(/Nhập số di động Việt Nam 10 số/u)).toBeTruthy();
    reply = jsonResponse({ code: 'TOO_MANY_BOOKINGS' }, 409);
    await userEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu đặt bàn' }));
    expect(await screen.findByText(/đã đặt 5 lần trong hôm nay/u)).toBeTruthy();
  });

  it('tells the guest when no time is left for the party', async () => {
    fakeApi({
      'GET /api/g/r/quan-ngon/slots': () =>
        jsonResponse(slots({ times: [{ time: '18:00', free: false }] })),
    });
    await renderGuest();
    expect(await screen.findByText(/không còn giờ trống cho 2 khách/u)).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Gửi yêu cầu đặt bàn' }).disabled,
    ).toBe(true);
  });

  it.each([
    [{ code: 'RESTAURANT_SUSPENDED' }, 403, 'Nhà hàng tạm ngưng'],
    [{ code: 'NOT_FOUND' }, 404, 'Không tìm thấy nhà hàng'],
  ])('shows a full-page state for %o', async (body, status, heading) => {
    fakeApi({ 'GET /api/g/r/quan-ngon/slots': () => jsonResponse(body, status) });
    await renderGuest();
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeTruthy();
  });

  it('says when the restaurant does not take online bookings', async () => {
    fakeApi({
      'GET /api/g/r/quan-ngon/slots': () => jsonResponse(slots({ enabled: false, times: [] })),
    });
    await renderGuest();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Quán chưa nhận đặt bàn online' }),
    ).toBeTruthy();
  });

  it('offers a retry when the page fails to load', async () => {
    let fail = true;
    fakeApi({
      'GET /api/g/r/quan-ngon/slots': () =>
        fail ? jsonResponse({ code: 'INTERNAL' }, 500) : jsonResponse(slots()),
    });
    await renderGuest();
    expect(await screen.findByText(/Không tải được trang đặt bàn/u)).toBeTruthy();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByLabelText('Giờ đến')).toBeTruthy();
  });
});

const booking = (over: Partial<Booking> = {}): Booking => ({
  id: 'b1',
  status: 'pending',
  tableId: 't4',
  tableName: 'Bàn 4',
  partySize: 3,
  guestName: 'Nguyễn Văn An',
  guestPhone: '+84912345678',
  note: 'Có trẻ nhỏ',
  date: '2099-11-20',
  time: '19:00',
  startsAt: '2099-11-20T12:00:00.000Z',
  endsAt: '2099-11-20T13:30:00.000Z',
  late: false,
  lateAt: '2099-11-20T12:15:00.000Z',
  version: 1,
  createdAt: '2026-11-08T00:00:00.000Z',
  ...over,
});

const TABLES = {
  items: [
    { id: 't2', name: 'Bàn 2', seats: 2 },
    { id: 't4', name: 'Bàn 4', seats: 4 },
    { id: 't6', name: 'Bàn 6', seats: 6 },
  ],
};

const renderStaff = async (role: StaffRole = 'owner') => {
  const result = await renderWithApp(BookingsPage, {
    paths: ['/dat-ban', '/quan-ly', '/dang-nhap', '/quan-ly/thuc-don', '/quan-ly/ban'],
    at: '/dat-ban',
  });
  useSessionStore().me = {
    user: { id: 'u', email: 'e@x.vn', role, displayName: '' },
    restaurant: { id: 'r', name: 'Quán Ngon', slug: 'quan-ngon' },
  };
  return result;
};

describe('staff booking list', () => {
  it('AC51–AC53 shows the day with status chips, the "Trễ" chip and the guest’s phone', async () => {
    const calls = fakeApi({
      'GET /api/bookings': () =>
        jsonResponse({
          date: TODAY,
          items: [
            booking(),
            booking({
              id: 'b2',
              status: 'confirmed',
              guestName: 'Trần Bình',
              late: true,
              startsAt: '2020-01-01T12:00:00.000Z',
              endsAt: '2020-01-01T13:30:00.000Z',
              lateAt: '2020-01-01T12:15:00.000Z',
            }),
            booking({ id: 'b3', status: 'seated', guestName: null, guestPhone: null, note: null }),
          ],
        }),
    });
    await renderStaff();
    const first = await screen.findByRole('article', { name: 'Nguyễn Văn An' });
    expect(within(first).getByText('Chờ duyệt')).toBeTruthy();
    expect(within(first).queryByText('Trễ')).toBeNull();
    expect(within(first).getByRole('link', { name: 'Gọi 0912 345 678' })).toBeTruthy();
    expect(within(first).getByText('Bàn: Bàn 4')).toBeTruthy();
    const late = screen.getByRole('article', { name: 'Trần Bình' });
    expect(within(late).getByText('Đã xác nhận')).toBeTruthy();
    expect(within(late).getByText('Trễ')).toBeTruthy();
    expect(within(late).getByRole('button', { name: 'Không đến' })).toBeTruthy();
    const erased = screen.getByRole('article', { name: 'khách' });
    expect(within(erased).getByText(/Đã xoá tên và số điện thoại/u)).toBeTruthy();
    expect(within(erased).queryByRole('button')).toBeNull();
    expect(calls[0]?.path).toBe(`/api/bookings?date=${TODAY}`);
    expect(screen.getByText(/3 lượt đặt/u)).toBeTruthy();
  });

  it('owner sees and copies the public booking link', async () => {
    fakeApi({ 'GET /api/bookings': () => jsonResponse({ date: TODAY, items: [] }) });
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await renderStaff();
    const link = await screen.findByLabelText<HTMLInputElement>('Đường dẫn đặt bàn');
    expect(link.value).toBe(`${window.location.origin}/r/quan-ngon/dat-ban`);
    await userEvent.click(screen.getByRole('button', { name: 'Sao chép' }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/r/quan-ngon/dat-ban`);
    expect(await screen.findByText('Đã sao chép đường dẫn đặt bàn')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Chưa có ai đặt bàn ngày này' })).toBeTruthy();
  });

  it('a cashier gets the staff shell without the share link', async () => {
    fakeApi({ 'GET /api/bookings': () => jsonResponse({ date: TODAY, items: [] }) });
    await renderStaff('cashier');
    await screen.findByRole('heading', { name: 'Chưa có ai đặt bàn ngày này' });
    expect(screen.queryByLabelText('Đường dẫn đặt bàn')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('AC51 confirms on a chosen table; a busy table is explained in the sheet', async () => {
    let busy = true;
    const calls = fakeApi({
      'GET /api/bookings': () => jsonResponse({ date: TODAY, items: [booking()] }),
      'GET /api/tables': () => jsonResponse(TABLES),
      'POST /api/bookings/b1/confirm': () =>
        busy
          ? jsonResponse({ code: 'TABLE_BUSY' }, 409)
          : jsonResponse(booking({ status: 'confirmed', tableId: 't6', tableName: 'Bàn 6' })),
    });
    await renderStaff();
    await userEvent.click(await screen.findByRole('button', { name: 'Xác nhận' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Xác nhận đặt bàn của Nguyễn Văn An',
    });
    const select = await within(dialog).findByLabelText<HTMLSelectElement>('Bàn');
    // Only tables that seat 3.
    expect([...select.options].map((o) => o.value)).toEqual(['t4', 't6']);
    expect(select.value).toBe('t4');
    await userEvent.selectOptions(select, 't6');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận' }));
    expect(await within(dialog).findByText(/đã có khách đặt trùng giờ/u)).toBeTruthy();
    busy = false;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận' }));
    expect(await screen.findByText('Đã xác nhận đặt bàn của Nguyễn Văn An')).toBeTruthy();
    expect(calls.filter((c) => c.method === 'POST').at(-1)?.body).toEqual({ tableId: 't6' });
    const card = screen.getByRole('article', { name: 'Nguyễn Văn An' });
    expect(within(card).getByText('Đã xác nhận')).toBeTruthy();
    expect(within(card).getByText('Bàn: Bàn 6')).toBeTruthy();
  });

  it('AC52 seats a party after confirming in a sheet; a busy table is explained', async () => {
    let open = true;
    fakeApi({
      'GET /api/bookings': () =>
        jsonResponse({ date: TODAY, items: [booking({ status: 'confirmed' })] }),
      'POST /api/bookings/b1/seat': () =>
        open
          ? jsonResponse({ code: 'TABLE_HAS_OPEN_SESSION' }, 409)
          : jsonResponse(booking({ status: 'seated' })),
    });
    await renderStaff();
    await userEvent.click(await screen.findByRole('button', { name: 'Nhận bàn' }));
    let dialog = await screen.findByRole('dialog', { name: 'Nhận bàn cho Nguyễn Văn An?' });
    expect(within(dialog).getByText(/Mở phiên phục vụ tại Bàn 4 cho 3 khách/u)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Nhận bàn' }));
    expect(await screen.findByText(/Bàn 4 đang có khách/u)).toBeTruthy();
    open = false;
    await userEvent.click(screen.getByRole('button', { name: 'Nhận bàn' }));
    dialog = await screen.findByRole('dialog', { name: 'Nhận bàn cho Nguyễn Văn An?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Nhận bàn' }));
    expect(await screen.findByText('Đã nhận bàn cho Nguyễn Văn An tại Bàn 4')).toBeTruthy();
    expect(screen.getByText('Đã nhận bàn')).toBeTruthy();
  });

  it('cancels with a confirmation and refreshes when someone else changed the booking', async () => {
    let gets = 0;
    fakeApi({
      'GET /api/bookings': () => {
        gets += 1;
        return jsonResponse({
          date: TODAY,
          items: [booking(gets > 1 ? { status: 'cancelled' } : {})],
        });
      },
      'POST /api/bookings/b1/cancel': () =>
        jsonResponse({ code: 'BOOKING_WRONG_STATUS', bookingStatus: 'cancelled' }, 409),
    });
    await renderStaff();
    await userEvent.click(await screen.findByRole('button', { name: 'Huỷ' }));
    const dialog = await screen.findByRole('dialog', { name: 'Huỷ đặt bàn của Nguyễn Văn An?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Huỷ đặt bàn' }));
    expect(await screen.findByText(/vừa được người khác cập nhật/u)).toBeTruthy();
    expect(await screen.findByText('Đã huỷ')).toBeTruthy();
  });

  it('marks a no-show after the start and moves between days', async () => {
    const calls = fakeApi({
      'GET /api/bookings': () =>
        jsonResponse({
          date: TODAY,
          items: [
            booking({
              startsAt: '2020-01-01T12:00:00.000Z',
              lateAt: '2020-01-01T12:15:00.000Z',
            }),
          ],
        }),
      'POST /api/bookings/b1/no-show': () => jsonResponse(booking({ status: 'no_show' })),
    });
    await renderStaff();
    await userEvent.click(await screen.findByRole('button', { name: 'Không đến' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Đánh dấu Nguyễn Văn An không đến?',
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Khách không đến' }));
    expect(await screen.findByText('Đã ghi nhận Nguyễn Văn An không đến')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Ngày sau' }));
    await waitFor(() =>
      expect(calls.at(-1)?.path).toBe(`/api/bookings?date=${shiftDate(TODAY, 1)}`),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Hôm nay' }));
    await waitFor(() => expect(calls.at(-1)?.path).toBe(`/api/bookings?date=${TODAY}`));
    await userEvent.click(screen.getByRole('button', { name: 'Ngày trước' }));
    await waitFor(() =>
      expect(calls.at(-1)?.path).toBe(`/api/bookings?date=${shiftDate(TODAY, -1)}`),
    );
  });

  it('shows an error with a retry when the list fails to load', async () => {
    let fail = true;
    fakeApi({
      'GET /api/bookings': () =>
        fail ? jsonResponse({ code: 'INTERNAL' }, 500) : jsonResponse({ date: TODAY, items: [] }),
    });
    await renderStaff();
    expect(await screen.findByText('Không tải được danh sách đặt bàn.')).toBeTruthy();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(
      await screen.findByRole('heading', { name: 'Chưa có ai đặt bàn ngày này' }),
    ).toBeTruthy();
  });
});
