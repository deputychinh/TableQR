import { screen, within } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { jsonResponse, renderWithApp } from '@/test/render';
import { useSessionStore, type StaffRole } from '@/stores/session';
import MenuPage from './pages/MenuPage.vue';
import MenuPreviewPage from './pages/MenuPreviewPage.vue';
import type { GuestMenu, StaffMenu } from './types';

type Handler = (body: unknown) => Response | Promise<Response>;

/** A tiny fake of the menu API: `routes['POST /api/menu/items'] = (body) => response`. */
const fakeApi = (routes: Record<string, Handler>) => {
  const calls: { key: string; body: unknown }[] = [];
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async (url, init) => {
      const key = `${init?.method ?? 'GET'} ${url}`;
      const body: unknown = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ key, body });
      const handler = routes[key];
      if (!handler) return jsonResponse({ code: 'NOT_FOUND' }, 404);
      return handler(body);
    },
  );
  vi.stubGlobal('fetch', fetchMock);
  return calls;
};

const empty = (): StaffMenu => ({
  stations: [{ id: 's1', name: 'Bếp', lateAfterMinutes: 15 }],
  categories: [],
});

const withItems = (): StaffMenu => ({
  stations: [
    { id: 's1', name: 'Bếp', lateAfterMinutes: 15 },
    { id: 's2', name: 'Quầy bar', lateAfterMinutes: 5 },
  ],
  categories: [
    {
      id: 'c1',
      name: 'Món chính',
      isMain: true,
      sortOrder: 0,
      items: [
        {
          id: 'i1',
          categoryId: 'c1',
          stationId: 's1',
          name: 'Phở bò',
          priceVnd: 45_000,
          description: 'Bò tái',
          available: true,
        },
      ],
    },
    { id: 'c2', name: 'Đồ uống', isMain: false, sortOrder: 1, items: [] },
  ],
});

const signIn = (role: StaffRole = 'owner') => {
  useSessionStore().me = {
    user: { id: 'u', email: 'e@example.com', role, displayName: '' },
    restaurant: { id: 'r', name: 'Quán Ngon', slug: 'quan-ngon' },
  };
};

const PATHS = [
  '/quan-ly',
  '/quan-ly/thuc-don',
  '/quan-ly/thuc-don/xem-truoc',
  '/quan-ly/ban',
  '/quan-ly/nhan-vien',
  '/quan-ly/cai-dat',
  '/dang-nhap',
];

const renderPage = async (role: StaffRole = 'owner') => {
  const result = await renderWithApp(MenuPage, { paths: PATHS, at: '/quan-ly/thuc-don' });
  signIn(role);
  return result;
};

describe('MenuPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the empty state and walks the owner through the first category and item (AC5)', async () => {
    const calls = fakeApi({
      'GET /api/menu': () => jsonResponse(empty()),
      'POST /api/menu/categories': (body) =>
        jsonResponse({ id: 'c1', sortOrder: 0, ...(body as object) }, 201),
      'POST /api/menu/items': (body) =>
        jsonResponse({ id: 'i1', available: true, ...(body as object) }, 201),
    });
    await renderPage();
    expect(await screen.findByText('Chưa có món nào')).toBeTruthy();
    expect(screen.getByText('Bếp')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Thêm món đầu tiên' }));
    const categorySheet = screen.getByRole('dialog', { name: 'Thêm nhóm món' });
    expect(within(categorySheet).getByText(/Trước tiên hãy tạo một nhóm món/)).toBeTruthy();
    await userEvent.type(within(categorySheet).getByLabelText('Tên nhóm'), 'Món chính');
    await userEvent.click(within(categorySheet).getByRole('switch'));
    await userEvent.click(within(categorySheet).getByRole('button', { name: 'Lưu' }));

    const itemSheet = await screen.findByRole('dialog', { name: 'Thêm món' });
    await userEvent.type(within(itemSheet).getByLabelText('Tên món'), 'Phở bò');
    await userEvent.type(within(itemSheet).getByLabelText('Giá bán'), '45.000');
    await userEvent.click(within(itemSheet).getByRole('button', { name: 'Lưu' }));

    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls.find((c) => c.key === 'POST /api/menu/categories')?.body).toEqual({
      name: 'Món chính',
      isMain: true,
    });
    expect(calls.find((c) => c.key === 'POST /api/menu/items')?.body).toEqual({
      name: 'Phở bò',
      priceVnd: 45_000,
      categoryId: 'c1',
      stationId: 's1',
      description: '',
    });
    const row = screen.getByText('Phở bò').closest('li');
    expect(row?.textContent?.replace(/ /gu, ' ')).toContain('45.000 ₫');
    expect(screen.queryByText('Chưa có món nào')).toBeNull();
  });

  it('checks the price before sending and shows the server’s field errors (AC7)', async () => {
    const calls = fakeApi({
      'GET /api/menu': () => jsonResponse(withItems()),
      'POST /api/menu/items': () =>
        jsonResponse(
          { code: 'VALIDATION_FAILED', fields: [{ path: 'name', code: 'too_big' }] },
          422,
        ),
    });
    await renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Thêm món' }));
    const sheet = screen.getByRole('dialog', { name: 'Thêm món' });
    await userEvent.type(within(sheet).getByLabelText('Giá bán'), '999');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Lưu' }));
    expect(within(sheet).getByText('Giá thấp nhất là 1.000 ₫.')).toBeTruthy();
    expect(calls.some((c) => c.key === 'POST /api/menu/items')).toBe(false);

    await userEvent.clear(within(sheet).getByLabelText('Giá bán'));
    await userEvent.type(within(sheet).getByLabelText('Giá bán'), '35,5');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Lưu' }));
    expect(within(sheet).getByText('Giá phải là số nguyên đồng, không có số lẻ.')).toBeTruthy();

    await userEvent.clear(within(sheet).getByLabelText('Giá bán'));
    await userEvent.type(within(sheet).getByLabelText('Giá bán'), '35000');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Lưu' }));
    expect(await within(sheet).findByText('Tên cần từ 1 đến 80 ký tự.')).toBeTruthy();
  });

  it('marks a dish "hết món" at once and rolls back with a message when saving fails (AC6)', async () => {
    let fail = false;
    fakeApi({
      'GET /api/menu': () => jsonResponse(withItems()),
      'PUT /api/menu/items/i1/availability': (body) =>
        fail
          ? jsonResponse({ code: 'INTERNAL' }, 500)
          : jsonResponse({ ...withItems().categories[0]?.items[0], ...(body as object) }),
    });
    await renderPage();
    const toggle = await screen.findByRole('switch', { name: 'Còn món: Phở bò' });
    await userEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(await screen.findByText('Hết món', { selector: '.status-chip' })).toBeTruthy();

    fail = true;
    await userEvent.click(toggle);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Chưa đổi được trạng thái "Phở bò"');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('explains why a category with items cannot be deleted (409) and deletes an item after confirming', async () => {
    fakeApi({
      'GET /api/menu': () => jsonResponse(withItems()),
      'DELETE /api/menu/categories/c1': () => jsonResponse({ code: 'CATEGORY_NOT_EMPTY' }, 409),
      'DELETE /api/menu/items/i1': () => jsonResponse(null, 204),
    });
    await renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Xoá nhóm Món chính' }));
    const confirm = screen.getByRole('dialog', { name: 'Xoá nhóm món?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Xoá' }));
    expect(
      await within(confirm).findByText('Nhóm món này còn món. Hãy chuyển hoặc xoá các món trước.'),
    ).toBeTruthy();
    await userEvent.click(within(confirm).getByRole('button', { name: 'Huỷ' }));

    await userEvent.click(screen.getByRole('button', { name: 'Sửa món Phở bò' }));
    const sheet = screen.getByRole('dialog', { name: 'Sửa món' });
    expect((within(sheet).getByLabelText('Giá bán') as HTMLInputElement).value).toBe('45.000');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Xoá món' }));
    const confirmItem = screen.getByRole('dialog', { name: 'Xoá món?' });
    expect(confirmItem.textContent).toContain('Khách sẽ không thấy món này nữa.');
    await userEvent.click(within(confirmItem).getByRole('button', { name: 'Xoá' }));
    await vi.waitFor(() => expect(screen.queryByText('Phở bò')).toBeNull());
    expect(screen.getByText('Chưa có món nào')).toBeTruthy();
  });

  it('edits an item, moves categories and manages stations', async () => {
    const calls = fakeApi({
      'GET /api/menu': () => jsonResponse(withItems()),
      'PATCH /api/menu/items/i1': (body) =>
        jsonResponse({ ...withItems().categories[0]?.items[0], ...(body as object) }),
      'POST /api/menu/categories/c2/move': () =>
        jsonResponse({
          categories: [
            { id: 'c2', name: 'Đồ uống', isMain: false, sortOrder: 0 },
            { id: 'c1', name: 'Món chính', isMain: true, sortOrder: 1 },
          ],
        }),
      'POST /api/menu/stations': (body) => jsonResponse({ id: 's3', ...(body as object) }, 201),
      'DELETE /api/menu/stations/s1': () => jsonResponse({ code: 'STATION_NOT_EMPTY' }, 409),
    });
    await renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Sửa món Phở bò' }));
    const sheet = screen.getByRole('dialog', { name: 'Sửa món' });
    await userEvent.selectOptions(within(sheet).getByLabelText('Nhóm món'), 'c2');
    await userEvent.selectOptions(within(sheet).getByLabelText('Khu bếp làm món này'), 's2');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Lưu' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls.find((c) => c.key === 'PATCH /api/menu/items/i1')?.body).toMatchObject({
      categoryId: 'c2',
      stationId: 's2',
      priceVnd: 45_000,
    });

    expect(screen.getByRole('button', { name: 'Đưa nhóm Món chính lên' })).toHaveProperty(
      'disabled',
      true,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Đưa nhóm Đồ uống lên' }));
    await vi.waitFor(() =>
      expect(screen.getAllByRole('heading', { level: 2 })[0]?.textContent).toContain('Đồ uống'),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Thêm khu bếp' }));
    const stationSheet = screen.getByRole('dialog', { name: 'Thêm khu bếp' });
    await userEvent.type(within(stationSheet).getByLabelText('Tên khu bếp'), 'Bếp lạnh');
    const late = within(stationSheet).getByLabelText('Báo trễ sau (phút)');
    await userEvent.clear(late);
    await userEvent.type(late, '200');
    await userEvent.click(within(stationSheet).getByRole('button', { name: 'Lưu' }));
    expect(within(stationSheet).getByText('Nhập số phút từ 1 đến 120.')).toBeTruthy();
    await userEvent.clear(late);
    await userEvent.type(late, '10');
    await userEvent.click(within(stationSheet).getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByText('Bếp lạnh')).toBeTruthy();
    expect(screen.getByText('Báo trễ sau 10 phút')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Xoá khu bếp Bếp' }));
    const confirm = screen.getByRole('dialog', { name: 'Xoá khu bếp?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Xoá' }));
    expect(
      await within(confirm).findByText(
        'Khu bếp này còn món. Hãy chuyển các món sang khu khác trước.',
      ),
    ).toBeTruthy();
  });

  it('shows a taken category name under the field', async () => {
    fakeApi({
      'GET /api/menu': () => jsonResponse(withItems()),
      'PATCH /api/menu/categories/c2': () => jsonResponse({ code: 'NAME_TAKEN' }, 409),
    });
    await renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Sửa nhóm Đồ uống' }));
    const sheet = screen.getByRole('dialog', { name: 'Sửa nhóm món' });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Lưu' }));
    expect(await within(sheet).findByText('Tên này đã có. Hãy chọn tên khác.')).toBeTruthy();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Huỷ' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('reloads when a moved category no longer exists', async () => {
    const calls = fakeApi({ 'GET /api/menu': () => jsonResponse(withItems()) });
    await renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Đưa nhóm Đồ uống lên' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Mục này không còn nữa');
    expect(calls.filter((c) => c.key === 'GET /api/menu')).toHaveLength(2);
  });

  it('lets the kitchen toggle availability but not edit; a waiter only reads', async () => {
    fakeApi({ 'GET /api/menu': () => jsonResponse(withItems()) });
    await renderPage('kitchen');
    expect(await screen.findByRole('switch', { name: 'Còn món: Phở bò' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sửa món Phở bò' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thêm món' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thêm khu bếp' })).toBeNull();
  });

  it('a waiter sees no switches', async () => {
    fakeApi({ 'GET /api/menu': () => jsonResponse(withItems()) });
    await renderPage('waiter');
    expect(await screen.findByText('Phở bò')).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('offers a retry when the menu cannot load', async () => {
    let attempts = 0;
    fakeApi({
      'GET /api/menu': () => {
        attempts += 1;
        return attempts === 1 ? jsonResponse({ code: 'INTERNAL' }, 500) : jsonResponse(empty());
      },
    });
    await renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Chưa có món nào')).toBeTruthy();
  });
});

describe('MenuPreviewPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  const guest: GuestMenu = {
    restaurant: { name: 'Quán Ngon', slug: 'quan-ngon' },
    categories: [
      {
        id: 'c1',
        name: 'Món chính',
        isMain: true,
        items: [
          { id: 'i1', name: 'Phở bò', priceVnd: 45_000, description: 'Bò tái', orderable: true },
          { id: 'i2', name: 'Bún chả', priceVnd: 40_000, description: null, orderable: false },
        ],
      },
    ],
  };

  /** Renders before the session exists (error state), then signs in and retries. */
  const renderPreview = async () => {
    await renderWithApp(MenuPreviewPage, { paths: PATHS, at: '/quan-ly/thuc-don/xem-truoc' });
    signIn();
    await userEvent.click(await screen.findByRole('button', { name: 'Thử lại' }));
  };

  it('shows the guest menu with "hết món" items flagged (AC6)', async () => {
    fakeApi({ 'GET /api/g/r/quan-ngon/menu': () => jsonResponse(guest) });
    await renderPreview();
    const sold = (await screen.findByText('Bún chả')).closest('li');
    expect(sold?.className).toContain('guest-menu-list__item--sold-out');
    expect(sold?.textContent).toContain('Hết món');
    const fresh = screen.getByText('Phở bò').closest('li');
    expect(fresh?.textContent).not.toContain('Hết món');
    expect(screen.getByRole('link', { name: 'Quay lại thực đơn' })).toBeTruthy();
  });

  it('says when there is nothing to show, and retries after an error', async () => {
    let attempts = 0;
    fakeApi({
      'GET /api/g/r/quan-ngon/menu': () => {
        attempts += 1;
        return attempts === 1
          ? jsonResponse({ code: 'INTERNAL' }, 500)
          : jsonResponse({ ...guest, categories: [] });
      },
    });
    await renderPreview();
    await userEvent.click(await screen.findByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Thực đơn chưa có món nào để khách xem.')).toBeTruthy();
  });
});
