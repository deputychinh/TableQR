import { screen, within } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/api/client';
import { useSessionStore } from '@/stores/session';
import { fakeApi } from '@/test/fake-api';
import { renderWithApp } from '@/test/render';
import StaffAddPage from './pages/StaffAddPage.vue';
import StaffDetailPage from './pages/StaffDetailPage.vue';
import StaffListPage from './pages/StaffListPage.vue';
import { describeStaffError, nameOf, type StaffMember } from './services/staff.service';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const KITCHEN_ID = '22222222-2222-4222-8222-222222222222';
const PATHS = [
  '/quan-ly',
  '/dang-nhap',
  '/quan-ly/thuc-don',
  '/quan-ly/ban',
  '/quan-ly/nhan-vien',
  '/quan-ly/nhan-vien/them',
  '/quan-ly/cai-dat',
  '/quan-ly/nhan-vien/:id',
];

const member = (patch: Partial<StaffMember> = {}): StaffMember => ({
  id: KITCHEN_ID,
  displayName: 'Anh Bếp',
  email: 'bep@example.com',
  role: 'kitchen',
  active: true,
  createdAt: '2026-11-08T00:00:00.000Z',
  ...patch,
});
const owner = member({
  id: OWNER_ID,
  displayName: '',
  email: 'chu@example.com',
  role: 'owner',
});

const signInAsOwner = () => {
  useSessionStore().me = {
    user: { id: OWNER_ID, email: 'chu@example.com', role: 'owner', displayName: '' },
    restaurant: { id: 'r', name: 'Quán Ngon', slug: 'quan-ngon' },
  };
};

afterEach(() => vi.unstubAllGlobals());

describe('staff service helpers', () => {
  it('falls back to "Chủ quán" for an owner and the email name for others, never the email', () => {
    expect(nameOf(owner)).toBe('Chủ quán');
    expect(nameOf(member())).toBe('Anh Bếp');
    expect(nameOf(member({ displayName: '  ' }))).toBe('bep');
  });

  it.each([
    ['CANNOT_CHANGE_SELF', 'staff.errors.self'],
    ['LAST_OWNER', 'staff.errors.lastOwner'],
    ['FORBIDDEN', 'staff.errors.forbidden'],
    ['NOT_FOUND', 'staff.errors.notFound'],
    ['EMAIL_TAKEN', 'staff.errors.emailTaken'],
    ['NETWORK', 'errors.network'],
    ['SOMETHING_ELSE', 'errors.unexpected'],
  ])('maps %s to %s', (code, key) => {
    expect(describeStaffError(new ApiError(400, code))).toBe(key);
  });

  it('maps a non-API error to the generic message', () => {
    expect(describeStaffError(new Error('x'))).toBe('errors.unexpected');
  });
});

describe('StaffListPage', () => {
  it('lists people with role chips, marks the owner and disabled accounts', async () => {
    fakeApi({
      'GET /api/staff': {
        body: { items: [owner, member(), member({ id: 'x', displayName: 'Lan', active: false })] },
      },
    });
    await renderWithApp(StaffListPage, { paths: PATHS, at: '/quan-ly/nhan-vien' });
    signInAsOwner();
    const list = await screen.findByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]?.textContent).toContain('(Bạn)');
    // The owner without a display name reads "Chủ quán", and their email shows once.
    expect(items[0]?.textContent).toContain('Chủ quán');
    expect(items[0]?.textContent.split('chu@example.com')).toHaveLength(2);
    expect(items[1]?.textContent).toContain('Bếp');
    expect(items[2]?.textContent).toContain('Đã khoá');
    expect(screen.getByRole('link', { name: /Thêm nhân viên/ }).getAttribute('href')).toBe(
      '/quan-ly/nhan-vien/them',
    );
    expect(screen.queryByText('Chưa có nhân viên nào')).toBeNull();
  });

  it('invites the owner to add the first person when only they exist', async () => {
    fakeApi({ 'GET /api/staff': { body: { items: [owner] } } });
    await renderWithApp(StaffListPage, { paths: PATHS, at: '/quan-ly/nhan-vien' });
    signInAsOwner();
    expect(await screen.findByText('Chưa có nhân viên nào')).toBeTruthy();
  });

  it('shows a plain error with a retry that loads again', async () => {
    const calls = fakeApi({ 'GET /api/staff': { status: 500, body: { code: 'INTERNAL' } } });
    await renderWithApp(StaffListPage, { paths: PATHS, at: '/quan-ly/nhan-vien' });
    expect(await screen.findByText('Không tải được danh sách nhân viên.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await vi.waitFor(() => expect(calls).toHaveLength(2));
  });
});

describe('StaffAddPage', () => {
  const fill = async (role?: RegExp) => {
    await userEvent.type(screen.getByLabelText('Tên hiển thị'), 'Anh Bếp');
    await userEvent.type(screen.getByLabelText('Email đăng nhập'), 'bep@example.com');
    await userEvent.type(screen.getByLabelText('Mật khẩu ban đầu'), 'mat-khau-dai-1');
    if (role) await userEvent.click(screen.getByRole('radio', { name: role }));
  };

  it('asks for a role before sending anything', async () => {
    const calls = fakeApi({});
    await renderWithApp(StaffAddPage, { paths: PATHS, at: '/quan-ly/nhan-vien/them' });
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Thêm nhân viên' }));
    expect(await screen.findByText('Hãy chọn một vai trò.')).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('offers only cashier, waiter and kitchen', async () => {
    fakeApi({});
    await renderWithApp(StaffAddPage, { paths: PATHS, at: '/quan-ly/nhan-vien/them' });
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('value'))).toEqual([
      'kitchen',
      'waiter',
      'cashier',
    ]);
  });

  it('creates the person and returns to the list', async () => {
    const calls = fakeApi({ 'POST /api/staff': { status: 201, body: member() } });
    const { router } = await renderWithApp(StaffAddPage, {
      paths: PATHS,
      at: '/quan-ly/nhan-vien/them',
    });
    await fill(/^Bếp/);
    await userEvent.click(screen.getByRole('button', { name: 'Thêm nhân viên' }));
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/quan-ly/nhan-vien'));
    expect(calls[0]?.body).toEqual({
      displayName: 'Anh Bếp',
      email: 'bep@example.com',
      password: 'mat-khau-dai-1',
      role: 'kitchen',
    });
  });

  it('shows a taken email under the field and keeps focus there', async () => {
    fakeApi({
      'POST /api/staff': {
        status: 409,
        body: { code: 'EMAIL_TAKEN', fields: [{ path: 'email', code: 'taken' }] },
      },
    });
    await renderWithApp(StaffAddPage, { paths: PATHS, at: '/quan-ly/nhan-vien/them' });
    await fill(/^Phục vụ/);
    await userEvent.click(screen.getByRole('button', { name: 'Thêm nhân viên' }));
    expect(await screen.findByText('Email này đã có tài khoản. Hãy dùng email khác.')).toBeTruthy();
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText('Email đăng nhập')),
    );
  });

  it('shows field errors from the API (422)', async () => {
    fakeApi({
      'POST /api/staff': {
        status: 422,
        body: {
          code: 'VALIDATION_FAILED',
          fields: [
            { path: 'displayName', code: 'too_big' },
            { path: 'password', code: 'too_small' },
          ],
        },
      },
    });
    await renderWithApp(StaffAddPage, { paths: PATHS, at: '/quan-ly/nhan-vien/them' });
    await fill(/^Thu ngân/);
    await userEvent.click(screen.getByRole('button', { name: 'Thêm nhân viên' }));
    expect(await screen.findByText('Tên hiển thị cần từ 1 đến 60 ký tự.')).toBeTruthy();
    expect(screen.getByText('Mật khẩu cần ít nhất 10 ký tự.')).toBeTruthy();
  });
});

describe('StaffDetailPage', () => {
  const renderDetail = async (id = KITCHEN_ID) => {
    const result = await renderWithApp(StaffDetailPage, {
      paths: PATHS,
      at: `/quan-ly/nhan-vien/${id}`,
      props: { id },
    });
    signInAsOwner();
    return result;
  };

  it('disables a person only after a confirm sheet that spells out the consequence', async () => {
    const calls = fakeApi({
      [`GET /api/staff/${KITCHEN_ID}`]: { body: member() },
      [`PATCH /api/staff/${KITCHEN_ID}`]: { body: member({ active: false }) },
    });
    await renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: 'Khoá tài khoản' }));
    const sheet = screen.getByRole('dialog', { name: 'Khoá tài khoản của Anh Bếp?' });
    expect(sheet.textContent).toContain('đăng xuất ngay trên mọi thiết bị');
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(0);
    await userEvent.click(within(sheet).getByRole('button', { name: 'Khoá tài khoản' }));
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      expect.stringContaining('Đã khoá. Anh Bếp đã bị đăng xuất.'),
    );
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ active: false });
    expect(screen.getByRole('button', { name: 'Mở khoá tài khoản' })).toBeTruthy();
  });

  it('cancelling the sheet changes nothing', async () => {
    const calls = fakeApi({ [`GET /api/staff/${KITCHEN_ID}`]: { body: member() } });
    await renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: 'Khoá tài khoản' }));
    await userEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('re-enables a disabled person directly', async () => {
    const calls = fakeApi({
      [`GET /api/staff/${KITCHEN_ID}`]: { body: member({ active: false }) },
      [`PATCH /api/staff/${KITCHEN_ID}`]: { body: member() },
    });
    await renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: 'Mở khoá tài khoản' }));
    expect(await screen.findByText(/Đã mở khoá/)).toBeTruthy();
    expect(calls[1]?.body).toEqual({ active: true });
  });

  it('changes the role', async () => {
    const calls = fakeApi({
      [`GET /api/staff/${KITCHEN_ID}`]: { body: member() },
      [`PATCH /api/staff/${KITCHEN_ID}`]: { body: member({ role: 'cashier' }) },
    });
    await renderDetail();
    const save = await screen.findByRole('button', { name: 'Lưu vai trò' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(screen.getByRole('radio', { name: /^Thu ngân/ }));
    await userEvent.click(save);
    expect(await screen.findByText(/Đã đổi vai trò/)).toBeTruthy();
    expect(calls[1]?.body).toEqual({ role: 'cashier' });
  });

  it('sets a new password after checking its length', async () => {
    const calls = fakeApi({
      [`GET /api/staff/${KITCHEN_ID}`]: { body: member() },
      [`PUT /api/staff/${KITCHEN_ID}/password`]: { status: 204 },
    });
    await renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: 'Đặt mật khẩu mới' }));
    const sheet = screen.getByRole('dialog');
    await userEvent.type(within(sheet).getByLabelText('Mật khẩu mới'), 'ngan');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Đặt mật khẩu' }));
    expect(within(sheet).getByText('Mật khẩu cần ít nhất 10 ký tự.')).toBeTruthy();
    await userEvent.type(within(sheet).getByLabelText('Mật khẩu mới'), '-dai-hon-1');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Đặt mật khẩu' }));
    expect(await screen.findByText(/Đã đặt mật khẩu mới/)).toBeTruthy();
    expect(calls[1]?.body).toEqual({ password: 'ngan-dai-hon-1' });
  });

  it('shows a refusal from the API as a plain message', async () => {
    fakeApi({
      [`GET /api/staff/${KITCHEN_ID}`]: { body: member({ role: 'owner' }) },
      [`PATCH /api/staff/${KITCHEN_ID}`]: { status: 409, body: { code: 'LAST_OWNER' } },
    });
    await renderDetail();
    await userEvent.click(await screen.findByRole('button', { name: 'Khoá tài khoản' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Khoá tài khoản' }),
    );
    expect(
      await screen.findByText('Nhà hàng cần ít nhất một chủ quán đang hoạt động.'),
    ).toBeTruthy();
  });

  it('on the owner’s own account: no disable, no password reset, role locked', async () => {
    fakeApi({ [`GET /api/staff/${OWNER_ID}`]: { body: owner } });
    await renderDetail(OWNER_ID);
    expect(await screen.findByText(/Đây là tài khoản của bạn/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Khoá tài khoản' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Đặt mật khẩu mới' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Lưu vai trò' })).toBeNull();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getByText(/Chủ quán — Toàn quyền/)).toBeTruthy();
  });

  it('says plainly when the person is not found (e.g. another restaurant)', async () => {
    fakeApi({});
    await renderDetail('33333333-3333-4333-8333-333333333333');
    expect(await screen.findByText(/Không tìm thấy nhân viên này/)).toBeTruthy();
  });
});
