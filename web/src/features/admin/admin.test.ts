import { screen, within } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/api/client';
import { fakeApi } from '@/test/fake-api';
import { renderWithApp } from '@/test/render';
import AdminRestaurantsPage from './pages/AdminRestaurantsPage.vue';
import { describeAdminError, type AdminRestaurant } from './services/admin.service';

const restaurant = (patch: Partial<AdminRestaurant> = {}): AdminRestaurant => ({
  id: 'r1',
  name: 'Bún Chả Hà Nội',
  slug: 'bun-cha-ha-noi',
  status: 'active',
  ownerEmail: 'chu@example.com',
  staffCount: 3,
  createdAt: '2026-11-08T00:00:00.000Z',
  ...patch,
});
const LIST = 'GET /api/admin/restaurants?limit=50&offset=0';

afterEach(() => vi.unstubAllGlobals());

describe('AdminRestaurantsPage', () => {
  it('lists restaurants with status and suspends one after confirming', async () => {
    const calls = fakeApi({
      [LIST]: { body: { items: [restaurant()], total: 1, limit: 50, offset: 0 } },
      'POST /api/admin/restaurants/r1/suspend': { body: restaurant({ status: 'suspended' }) },
    });
    await renderWithApp(AdminRestaurantsPage, { paths: ['/dang-nhap', '/quan-tri'] });
    expect(await screen.findByText('Bún Chả Hà Nội')).toBeTruthy();
    expect(screen.getByText('Đang hoạt động')).toBeTruthy();
    expect(screen.getByText(/chu@example.com · 3 tài khoản/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Tạm ngưng Bún Chả Hà Nội' }));
    const sheet = screen.getByRole('dialog', { name: 'Tạm ngưng Bún Chả Hà Nội?' });
    expect(sheet.textContent).toContain('Nhà hàng tạm ngưng');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Tạm ngưng' }));
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      expect.stringContaining('Đã tạm ngưng Bún Chả Hà Nội.'),
    );
    expect(screen.getAllByText('Tạm ngưng').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Mở lại Bún Chả Hà Nội' })).toBeTruthy();
    expect(calls.map((c) => `${c.method} ${c.path}`)).toContain(
      'POST /api/admin/restaurants/r1/suspend',
    );
  });

  it('reactivates a suspended restaurant', async () => {
    fakeApi({
      [LIST]: {
        body: { items: [restaurant({ status: 'suspended', ownerEmail: null })], total: 1 },
      },
      'POST /api/admin/restaurants/r1/reactivate': { body: restaurant() },
    });
    await renderWithApp(AdminRestaurantsPage, { paths: ['/dang-nhap'] });
    expect(await screen.findByText(/Chưa có chủ quán/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Mở lại Bún Chả Hà Nội' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Mở lại' }),
    );
    expect(await screen.findByText('Đã mở lại Bún Chả Hà Nội.')).toBeTruthy();
  });

  it('keeps the sheet open with the error when the action fails', async () => {
    fakeApi({
      [LIST]: { body: { items: [restaurant()], total: 1 } },
      'POST /api/admin/restaurants/r1/suspend': { status: 404, body: { code: 'NOT_FOUND' } },
    });
    await renderWithApp(AdminRestaurantsPage, { paths: ['/dang-nhap'] });
    await userEvent.click(await screen.findByRole('button', { name: 'Tạm ngưng Bún Chả Hà Nội' }));
    const sheet = screen.getByRole('dialog');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Tạm ngưng' }));
    expect(await within(sheet).findByText('Không tìm thấy nhà hàng này.')).toBeTruthy();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Huỷ' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('loads more restaurants page by page', async () => {
    const calls = fakeApi({
      [LIST]: { body: { items: [restaurant()], total: 2 } },
      'GET /api/admin/restaurants?limit=50&offset=1': {
        body: { items: [restaurant({ id: 'r2', name: 'Phở Bò' })], total: 2 },
      },
    });
    await renderWithApp(AdminRestaurantsPage, { paths: ['/dang-nhap'] });
    await userEvent.click(await screen.findByRole('button', { name: 'Xem thêm' }));
    expect(await screen.findByText('Phở Bò')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Xem thêm' })).toBeNull();
    expect(calls).toHaveLength(2);
  });

  it('shows empty and error states', async () => {
    fakeApi({ [LIST]: { body: { items: [], total: 0 } } });
    const first = await renderWithApp(AdminRestaurantsPage, { paths: ['/dang-nhap'] });
    expect(await screen.findByText('Chưa có nhà hàng nào đăng ký.')).toBeTruthy();
    first.unmount();
    fakeApi({ [LIST]: { status: 500, body: { code: 'INTERNAL' } } });
    await renderWithApp(AdminRestaurantsPage, { paths: ['/dang-nhap'] });
    expect(await screen.findByText('Không tải được danh sách nhà hàng.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeTruthy();
  });

  it('maps errors to messages', () => {
    expect(describeAdminError(new ApiError(0, 'NETWORK'))).toBe('errors.network');
    expect(describeAdminError(new Error('x'))).toBe('errors.unexpected');
  });
});
