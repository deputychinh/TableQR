import { screen, waitFor, within } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { jsonResponse, renderWithApp } from '@/test/render';
import { useSessionStore, type StaffRole } from '@/stores/session';
import type { TableItem } from './api';
import TablesPage from './pages/TablesPage.vue';
import TablePrintPage from './pages/TablePrintPage.vue';
import GuestTablePage from './pages/GuestTablePage.vue';

const table = (over: Partial<TableItem> = {}): TableItem => ({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Bàn 1',
  seats: 4,
  qrToken: 'AAAAAAAAAAAAAAAAAAAAAA',
  qrRotatedAt: null,
  createdAt: '2026-11-08T00:00:00.000Z',
  ...over,
});

type Handler = (init: RequestInit | undefined) => Response | Promise<Response>;

/** A fake API: `routes['GET /api/tables']` answers that call; anything else fails the test. */
const fakeApi = (routes: Record<string, Handler>) => {
  const calls: { key: string; body: unknown }[] = [];
  const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(
    (input, init) => {
      const key = `${init?.method ?? 'GET'} ${input}`;
      calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const handler = routes[key];
      if (!handler) throw new Error(`unexpected ${key}`);
      return Promise.resolve(handler(init));
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  return calls;
};

const signedInAs = (role: StaffRole) => {
  useSessionStore().me = {
    user: { id: 'u', email: 'e@x.vn', role, displayName: '' },
    restaurant: { id: 'r', name: 'Quán Ngon', slug: 'quan-ngon' },
  };
};

const renderTables = async (role: StaffRole = 'owner') => {
  const result = await renderWithApp(TablesPage, {
    paths: ['/quan-ly', '/quan-ly/ban', '/quan-ly/ban/in', '/dang-nhap'],
    at: '/quan-ly/ban',
  });
  signedInAs(role);
  return result;
};

afterEach(() => vi.unstubAllGlobals());

describe('tables page', () => {
  it('shows a friendly empty state whose action opens the add form', async () => {
    fakeApi({ 'GET /api/tables': () => jsonResponse({ items: [] }) });
    await renderTables();
    expect(await screen.findByRole('heading', { name: 'Chưa có bàn nào' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Thêm bàn đầu tiên' }));
    const dialog = await screen.findByRole('dialog', { name: 'Thêm bàn' });
    expect(within(dialog).getByLabelText('Tên bàn')).toBeTruthy();
  });

  it('AC8 adds a table and shows it with its QR code linking to the guest page', async () => {
    const created = table({ name: 'Bàn 7', seats: 6, qrToken: 'BBBBBBBBBBBBBBBBBBBBBB' });
    const calls = fakeApi({
      'GET /api/tables': () => jsonResponse({ items: [] }),
      'POST /api/tables': () => jsonResponse(created, 201),
    });
    await renderTables();
    await userEvent.click(await screen.findByRole('button', { name: 'Thêm bàn đầu tiên' }));
    await userEvent.type(screen.getByLabelText('Tên bàn'), '  Bàn 7 ');
    await userEvent.click(screen.getByRole('button', { name: 'Thêm một chỗ' }));
    await userEvent.click(screen.getByRole('button', { name: 'Thêm một chỗ' }));
    await userEvent.click(screen.getByRole('button', { name: 'Thêm bàn' }));
    expect(calls.at(-1)).toEqual({ key: 'POST /api/tables', body: { name: 'Bàn 7', seats: 6 } });
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      'Đã thêm Bàn 7. Mã QR đã sẵn sàng để in.',
    );
    expect(screen.getByRole('heading', { name: 'Bàn 7' })).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Xem trang khách của Bàn 7' });
    expect(link.getAttribute('href')).toBe(`${window.location.origin}/t/BBBBBBBBBBBBBBBBBBBBBB`);
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Mã QR của Bàn 7' }).getAttribute('src')).toMatch(
        /^data:image\/svg\+xml/,
      ),
    );
  });

  it('validates on the phone before sending; typed seats are kept within 1–30', async () => {
    const calls = fakeApi({ 'GET /api/tables': () => jsonResponse({ items: [] }) });
    await renderTables();
    await userEvent.click(await screen.findByRole('button', { name: 'Thêm bàn đầu tiên' }));
    const seats = screen.getByLabelText('Số chỗ ngồi');
    await userEvent.clear(seats);
    await userEvent.type(seats, '31');
    await userEvent.click(screen.getByRole('button', { name: 'Thêm bàn' }));
    expect(screen.getByText('Tên bàn cần từ 1 đến 30 ký tự.')).toBeTruthy();
    expect((seats as HTMLInputElement).value).toBe('30');
    expect(screen.queryByText('Số chỗ ngồi từ 1 đến 30.')).toBeNull();
    expect(screen.getByLabelText('Tên bàn')).toBe(document.activeElement);
    expect(calls.map((c) => c.key)).toEqual(['GET /api/tables']);
  });

  it('shows "name already used" under the name field when the API refuses it', async () => {
    fakeApi({
      'GET /api/tables': () => jsonResponse({ items: [table()] }),
      'POST /api/tables': () =>
        jsonResponse({ code: 'TABLE_NAME_TAKEN', fields: [{ path: 'name', code: 'taken' }] }, 409),
    });
    await renderTables();
    await userEvent.click(await screen.findByRole('button', { name: 'Thêm bàn' }));
    await userEvent.type(screen.getByLabelText('Tên bàn'), 'bàn 1');
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Thêm bàn' }),
    );
    expect(await screen.findByText('Quán đã có bàn tên này. Hãy đặt tên khác.')).toBeTruthy();
  });

  it('edits a table name and seats', async () => {
    const calls = fakeApi({
      'GET /api/tables': () => jsonResponse({ items: [table()] }),
      'PATCH /api/tables/11111111-1111-4111-8111-111111111111': () =>
        jsonResponse(table({ name: 'Bàn VIP', seats: 3 })),
    });
    await renderTables();
    await userEvent.click(await screen.findByRole('button', { name: 'Sửa Bàn 1' }));
    const name = screen.getByLabelText('Tên bàn');
    expect((name as HTMLInputElement).value).toBe('Bàn 1');
    await userEvent.clear(name);
    await userEvent.type(name, 'Bàn VIP');
    await userEvent.click(screen.getByRole('button', { name: 'Bớt một chỗ' }));
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect(calls.at(-1)?.body).toEqual({ name: 'Bàn VIP', seats: 3 });
    expect(await screen.findByRole('heading', { name: 'Bàn VIP' })).toBeTruthy();
  });

  it('AC10 regenerates a QR code only after a confirmation that explains the consequence', async () => {
    const calls = fakeApi({
      'GET /api/tables': () => jsonResponse({ items: [table()] }),
      'POST /api/tables/11111111-1111-4111-8111-111111111111/rotate-qr': () =>
        jsonResponse(table({ qrToken: 'CCCCCCCCCCCCCCCCCCCCCC' })),
    });
    await renderTables();
    await userEvent.click(await screen.findByRole('button', { name: 'Đổi mã QR của Bàn 1' }));
    const sheet = screen.getByRole('dialog', { name: 'Đổi mã QR của Bàn 1?' });
    expect(sheet.textContent).toContain('Mã QR đã hết hạn');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Đổi mã QR' }));
    expect(calls.at(-1)?.key).toBe(
      'POST /api/tables/11111111-1111-4111-8111-111111111111/rotate-qr',
    );
    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: 'Xem trang khách của Bàn 1' }).getAttribute('href'),
      ).toContain('CCCCCCCCCCCCCCCCCCCCCC'),
    );
    expect(screen.getByRole('status').textContent).toContain('Đã đổi mã QR của Bàn 1');
  });

  it('cancelling the confirmation changes nothing', async () => {
    const calls = fakeApi({ 'GET /api/tables': () => jsonResponse({ items: [table()] }) });
    await renderTables();
    await userEvent.click(await screen.findByRole('button', { name: 'Xoá Bàn 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('deletes a table after confirmation and shows the empty state again', async () => {
    fakeApi({
      'GET /api/tables': () => jsonResponse({ items: [table()] }),
      'DELETE /api/tables/11111111-1111-4111-8111-111111111111': () => jsonResponse(null, 204),
    });
    await renderTables();
    await userEvent.click(await screen.findByRole('button', { name: 'Xoá Bàn 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Xoá bàn' }));
    expect(await screen.findByRole('heading', { name: 'Chưa có bàn nào' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Đã xoá Bàn 1.');
  });

  it('reloads with a plain message when the table was already deleted elsewhere', async () => {
    let lists = 0;
    fakeApi({
      'GET /api/tables': () => {
        lists += 1;
        return jsonResponse({ items: lists === 1 ? [table()] : [] });
      },
      'DELETE /api/tables/11111111-1111-4111-8111-111111111111': () =>
        jsonResponse({ code: 'NOT_FOUND' }, 404),
    });
    await renderTables();
    await userEvent.click(await screen.findByRole('button', { name: 'Xoá Bàn 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Xoá bàn' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('Bàn này không còn nữa') as string,
    );
    expect(await screen.findByRole('heading', { name: 'Chưa có bàn nào' })).toBeTruthy();
  });

  it('lists tables in natural order: Bàn 2 before Bàn 10', async () => {
    fakeApi({
      'GET /api/tables': () =>
        jsonResponse({
          items: [
            table({ id: 'a', name: 'Bàn 10' }),
            table({ id: 'b', name: 'Bàn 2', qrToken: 'DDDDDDDDDDDDDDDDDDDDDD' }),
          ],
        }),
    });
    await renderTables();
    await screen.findByRole('heading', { name: 'Bàn 10' });
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Bàn 2',
      'Bàn 10',
    ]);
    expect(screen.getByText('2 bàn')).toBeTruthy();
  });

  it('waiters see and print tables but cannot add, edit, regenerate or delete', async () => {
    fakeApi({ 'GET /api/tables': () => jsonResponse({ items: [table()] }) });
    // The real route table and guard: the print sheet must really be open to a waiter (D5).
    const { router } = await renderWithApp(TablesPage, {
      guarded: true,
      at: '/quan-ly/ban',
      me: {
        user: { id: 'u', email: 'e@x.vn', role: 'waiter', displayName: '' },
        restaurant: { id: 'r', name: 'Quán Ngon', slug: 'quan-ngon' },
      },
    });
    await screen.findByRole('heading', { name: 'Bàn 1' });
    expect(screen.queryByRole('button', { name: 'Thêm bàn' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sửa Bàn 1' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Xoá Bàn 1' })).toBeNull();
    expect(screen.getByText(/Chỉ chủ quán mới thêm/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'In mã QR của Bàn 1' }));
    await waitFor(() =>
      expect(router.currentRoute.value.fullPath).toBe(`/quan-ly/ban/in?ban=${table().id}`),
    );
  });

  it('opens the print sheet for all tables', async () => {
    fakeApi({ 'GET /api/tables': () => jsonResponse({ items: [table()] }) });
    const { router } = await renderTables();
    await userEvent.click(await screen.findByRole('button', { name: 'In tất cả mã QR' }));
    await waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/quan-ly/ban/in'));
  });

  it('shows an error with a retry when the list cannot load', async () => {
    let fail = true;
    fakeApi({
      'GET /api/tables': () =>
        fail ? jsonResponse({ code: 'INTERNAL' }, 500) : jsonResponse({ items: [] }),
    });
    await renderTables();
    expect(await screen.findByText(/Không tải được danh sách bàn/)).toBeTruthy();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('heading', { name: 'Chưa có bàn nào' })).toBeTruthy();
  });
});

describe('print sheet (AC9)', () => {
  const renderPrint = async (at = '/quan-ly/ban/in') => {
    const result = await renderWithApp(TablePrintPage, {
      paths: ['/quan-ly/ban', '/quan-ly/ban/in'],
      at,
    });
    signedInAs('owner');
    return result;
  };

  it('shows one card per table with QR, table name, restaurant name and the scan line', async () => {
    fakeApi({
      'GET /api/tables': () =>
        jsonResponse({
          items: [table(), table({ id: 'b', name: 'Bàn 2', qrToken: 'EEEEEEEEEEEEEEEEEEEEEE' })],
        }),
    });
    await renderPrint();
    const sheet = await screen.findByRole('region', { name: 'Trang in mã QR' });
    const cards = within(sheet).getAllByRole('article');
    expect(cards).toHaveLength(2);
    expect(within(cards[0] as HTMLElement).getByRole('heading').textContent).toBe('Bàn 1');
    expect(within(sheet).getAllByText('Quán Ngon')).toHaveLength(2);
    expect(within(sheet).getAllByText('Quét mã để gọi món')).toHaveLength(2);
    expect(within(sheet).getByRole('img', { name: 'Mã QR của Bàn 2' })).toBeTruthy();
  });

  it('prints with the browser dialog', async () => {
    fakeApi({ 'GET /api/tables': () => jsonResponse({ items: [table()] }) });
    const print = vi.fn<() => void>();
    vi.stubGlobal('print', print);
    await renderPrint();
    await userEvent.click(await screen.findByRole('button', { name: 'In ngay' }));
    expect(print).toHaveBeenCalledOnce();
  });

  it('prints a single table with ?ban=<id>', async () => {
    fakeApi({
      'GET /api/tables': () =>
        jsonResponse({ items: [table(), table({ id: 'b', name: 'Bàn 2' })] }),
    });
    await renderPrint('/quan-ly/ban/in?ban=b');
    const sheet = await screen.findByRole('region', { name: 'Trang in mã QR' });
    expect(within(sheet).getAllByRole('article')).toHaveLength(1);
    expect(within(sheet).getByRole('heading').textContent).toBe('Bàn 2');
  });

  it('says so when the single table no longer exists', async () => {
    fakeApi({ 'GET /api/tables': () => jsonResponse({ items: [table()] }) });
    await renderPrint('/quan-ly/ban/in?ban=gone');
    expect(await screen.findByText(/Không tìm thấy bàn này/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'In ngay' })).toBeNull();
  });

  it('shows an error with retry when tables cannot load', async () => {
    fakeApi({ 'GET /api/tables': () => jsonResponse({ code: 'INTERNAL' }, 500) });
    await renderPrint();
    expect(await screen.findByRole('button', { name: 'Thử lại' })).toBeTruthy();
  });
});

describe('guest table page', () => {
  const renderGuest = (token = 'AAAAAAAAAAAAAAAAAAAAAA') =>
    renderWithApp(GuestTablePage, { paths: ['/t/:qrToken'], at: `/t/${token}` });

  it('AC8 shows the restaurant and the table, with the menu placeholder', async () => {
    fakeApi({
      'GET /api/g/t/AAAAAAAAAAAAAAAAAAAAAA': () =>
        jsonResponse({
          restaurant: { name: 'Quán Ngon', slug: 'quan-ngon' },
          table: { id: 't', name: 'Bàn 3', seats: 4 },
        }),
    });
    await renderGuest();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Chào mừng bạn đến Quán Ngon' }),
    ).toBeTruthy();
    expect(screen.getAllByText('Bàn 3').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Thực đơn sắp có' })).toBeTruthy();
    expect(document.title).toBe('Bàn 3 · Quán Ngon');
  });

  it('AC10 an old code shows "Mã QR đã hết hạn"', async () => {
    fakeApi({
      'GET /api/g/t/AAAAAAAAAAAAAAAAAAAAAA': () => jsonResponse({ code: 'QR_EXPIRED' }, 410),
    });
    await renderGuest();
    expect(await screen.findByRole('heading', { level: 1, name: 'Mã QR đã hết hạn' })).toBeTruthy();
    expect(screen.queryByText('Thực đơn sắp có')).toBeNull();
  });

  it('AC11 an unknown code shows "Không tìm thấy bàn" and nothing to order', async () => {
    fakeApi({ 'GET /api/g/t/nope': () => jsonResponse({ code: 'TABLE_NOT_FOUND' }, 404) });
    await renderGuest('nope');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Không tìm thấy bàn' }),
    ).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers a retry when the network fails', async () => {
    let fail = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        fail
          ? Promise.reject(new TypeError('offline'))
          : Promise.resolve(
              jsonResponse({
                restaurant: { name: 'Quán Ngon', slug: 'q' },
                table: { id: 't', name: 'Bàn 3', seats: 4 },
              }),
            ),
      ),
    );
    await renderGuest();
    expect(await screen.findByText(/Không mở được bàn/)).toBeTruthy();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('heading', { name: 'Thực đơn sắp có' })).toBeTruthy();
  });
});
