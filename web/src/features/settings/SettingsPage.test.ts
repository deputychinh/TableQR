import { nextTick } from 'vue';
import { fireEvent, render, screen, within } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { createPinia } from 'pinia';
import { RouterView, createMemoryHistory, createRouter } from 'vue-router';
import { i18n } from '@/locales';
import SettingsPage from './SettingsPage.vue';
import type { OwnerSettings } from './model';
import { jsonResponse, renderWithApp } from '@/test/render';
import { ownerSettings } from '@/test/settings-fixtures';

const PATHS = [
  '/quan-ly',
  '/quan-ly/thuc-don',
  '/quan-ly/ban',
  '/quan-ly/nhan-vien',
  '/quan-ly/cai-dat',
  '/dang-nhap',
];

type Call = { method: string; url: string; body: unknown };

/** A fake API: GET answers `initial`, PUT echoes the body back the way the server would. */
const stubApi = (initial: OwnerSettings, put?: (body: unknown) => Response) => {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body: unknown = init?.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ method, url, body });
      if (method === 'PUT') {
        if (put) return Promise.resolve(put(body));
        const sent = body as { rules: OwnerSettings['rules']; bank: OwnerSettings['bank'] };
        return Promise.resolve(
          jsonResponse({
            ...initial,
            rules: sent.rules,
            rulesUpdatedAt: '2026-11-08T05:00:00.000Z',
            bank: sent.bank && { ...sent.bank, bankName: 'Vietcombank' },
            bankChangedAt: sent.bank ? '2026-11-08T05:00:00.000Z' : initial.bankChangedAt,
          }),
        );
      }
      return Promise.resolve(jsonResponse(initial));
    }),
  );
  return calls;
};

const renderPage = async () => {
  const result = await renderWithApp(SettingsPage, { paths: PATHS, at: '/quan-ly/cai-dat' });
  await screen.findByRole('heading', { name: 'Thanh toán' });
  return result;
};

/** As the app mounts it: through a RouterView, so the page's leave guard is registered. */
const renderRouted = async () => {
  const stub = { template: '<div>stub</div>' };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: PATHS.map((path) => ({
      path,
      component: path === '/quan-ly/cai-dat' ? SettingsPage : stub,
    })),
  });
  await router.push('/quan-ly/cai-dat');
  render(RouterView, { global: { plugins: [i18n, createPinia(), router] } });
  await screen.findByRole('heading', { name: 'Thanh toán' });
  return { router };
};

const PASSWORD_LABEL = 'Mật khẩu đăng nhập của bạn';

/** Fills a new bank account and opens the confirm sheet. */
const openBankSheet = async () => {
  await userEvent.selectOptions(screen.getByLabelText('Ngân hàng'), '970436');
  await userEvent.type(screen.getByLabelText('Số tài khoản'), '0123456789');
  await userEvent.type(screen.getByLabelText('Tên chủ tài khoản'), 'An');
  await userEvent.click(saveButton());
  return screen.getByRole('dialog', { name: 'Đổi tài khoản nhận tiền?' });
};

const saveButton = () => screen.getByRole('button', { name: 'Lưu thay đổi' }) as HTMLButtonElement;

describe('SettingsPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the defaults as radio cards with their explanations; nothing to save yet', async () => {
    stubApi(ownerSettings());
    await renderPage();
    expect(
      (screen.getByRole('radio', { name: /Ăn xong mới thanh toán/ }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByRole('radio', { name: /Khách tự quét mã mở bàn/ }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByRole('radio', { name: /Chỉ đơn bất thường cần duyệt/ }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(screen.getByText(/Món chỉ vào bếp sau khi thu ngân xác nhận/)).toBeTruthy();
    expect(
      (screen.getByRole('spinbutton', { name: 'Tối đa món chính mỗi người' }) as HTMLInputElement)
        .value,
    ).toBe('2');
    expect(
      (
        screen.getByRole('spinbutton', {
          name: 'Tối thiểu món chính mỗi người',
        }) as HTMLInputElement
      ).value,
    ).toBe('0,5');
    expect(screen.getByLabelText('Giờ mở cửa ngày Thứ Hai')).toBeTruthy();
    expect(screen.getByText('Hoá đơn sẽ ghi “Thanh toán tại quầy”.')).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
    expect(screen.getByText(/Chưa có thay đổi/)).toBeTruthy();
  });

  it('saves changed rules without asking when the bank stays the same', async () => {
    const calls = stubApi(ownerSettings());
    await renderPage();
    await userEvent.click(screen.getByText('Thanh toán trước khi bếp làm'));
    await userEvent.click(screen.getByText('Duyệt mọi đơn'));
    await userEvent.click(screen.getByRole('button', { name: 'Tăng Tối đa món chính mỗi người' }));
    await userEvent.click(screen.getByLabelText('Nghỉ ngày Thứ Hai'));
    expect(screen.getByText(/Bạn có thay đổi chưa lưu/)).toBeTruthy();
    await userEvent.click(saveButton());
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.url).toBe('/api/restaurant/settings');
    expect(put?.body).toMatchObject({
      rules: {
        paymentTiming: 'pay_before',
        orderApproval: 'every_order',
        anomaly: { maxMainPerPerson: 2.5 },
        booking: { openingHours: { mon: { closed: true } } },
      },
      bank: null,
    });
    // Rules only: no password asked, none sent (TQR-023).
    expect(put?.body).not.toHaveProperty('currentPassword');
    expect(await screen.findByText(/Đã lưu/)).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
  });

  it('TQR-028 picks the kitchen reminder and repeat times (default 10 minutes) and saves them', async () => {
    const calls = stubApi(ownerSettings());
    await renderPage();
    const reminder = screen.getByRole('group', { name: 'Nhắc khi một món chờ quá' });
    const repeat = screen.getByRole('group', { name: 'Nếu món vẫn chưa xong, nhắc lại sau mỗi' });
    expect(
      within(reminder)
        .getAllByRole('radio')
        .map((r) => (r as HTMLInputElement).value),
    ).toEqual(['5', '10', '15', '20']);
    expect(
      (within(reminder).getByRole('radio', { name: /^10 phút/ }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (within(repeat).getByRole('radio', { name: /^10 phút/ }) as HTMLInputElement).checked,
    ).toBe(true);
    await userEvent.click(within(reminder).getByRole('radio', { name: /^5 phút/ }));
    await userEvent.click(within(repeat).getByRole('radio', { name: /^15 phút/ }));
    await userEvent.click(saveButton());
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.body).toMatchObject({
      rules: { kitchen: { reminderMinutes: 5, repeatMinutes: 15 } },
    });
  });

  it('turning booking off hides the slot length and opening hours', async () => {
    stubApi(ownerSettings());
    await renderPage();
    await userEvent.click(screen.getByText('Không nhận đặt bàn'));
    expect(screen.queryByText('Giờ mở cửa')).toBeNull();
    expect(screen.queryByRole('spinbutton', { name: 'Mỗi lượt đặt giữ bàn trong' })).toBeNull();
  });

  it('previews the bank name live and confirms a new bank account before saving', async () => {
    const calls = stubApi(ownerSettings());
    await renderPage();
    await userEvent.selectOptions(screen.getByLabelText('Ngân hàng'), '970436');
    await userEvent.type(screen.getByLabelText('Số tài khoản'), '0123 456 789');
    await userEvent.type(screen.getByLabelText('Tên chủ tài khoản'), 'Nguyễn Văn Ánh');
    const preview = screen.getByTestId('bank-preview');
    expect(preview.textContent).toContain('Vietcombank');
    expect(preview.textContent).toContain('0123456789');
    expect(preview.textContent).toContain('NGUYEN VAN ANH');
    await userEvent.click(saveButton());
    const sheet = screen.getByRole('dialog', { name: 'Đổi tài khoản nhận tiền?' });
    expect(within(sheet).getByText(/NGUYEN VAN ANH/)).toBeTruthy();
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    await userEvent.type(within(sheet).getByLabelText(PASSWORD_LABEL), 'mat-khau-dai-123');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Đúng, lưu tài khoản này' }));
    expect(calls.find((c) => c.method === 'PUT')?.body).toMatchObject({
      bank: { bin: '970436', accountNumber: '0123456789', accountName: 'NGUYEN VAN ANH' },
      currentPassword: 'mat-khau-dai-123',
    });
    expect(await screen.findByText(/Tài khoản đổi lần cuối lúc/)).toBeTruthy();
  });

  it('"Huỷ" closes the bank sheet without saving', async () => {
    const calls = stubApi(ownerSettings());
    await renderPage();
    await userEvent.selectOptions(screen.getByLabelText('Ngân hàng'), '970422');
    await userEvent.type(screen.getByLabelText('Số tài khoản'), '123456');
    await userEvent.type(screen.getByLabelText('Tên chủ tài khoản'), 'An');
    await userEvent.click(saveButton());
    await userEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
  });

  it('removing the bank account asks with the consequence, then saves null', async () => {
    const calls = stubApi(
      ownerSettings({
        bank: {
          bin: '970436',
          bankName: 'Vietcombank',
          accountNumber: '0123456789',
          accountName: 'NGUYEN VAN ANH',
        },
        bankChangedAt: '2026-11-07T03:00:00.000Z',
      }),
    );
    await renderPage();
    expect(screen.getByText(/Tài khoản đổi lần cuối lúc/)).toBeTruthy();
    await userEvent.selectOptions(
      screen.getByLabelText('Ngân hàng'),
      'Chưa cài — khách thanh toán tại quầy',
    );
    expect(screen.queryByLabelText('Số tài khoản')).toBeNull();
    await userEvent.click(saveButton());
    const sheet = screen.getByRole('dialog', { name: 'Bỏ tài khoản nhận tiền?' });
    await userEvent.type(within(sheet).getByLabelText(PASSWORD_LABEL), 'mat-khau-dai-123');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Bỏ tài khoản' }));
    expect(calls.find((c) => c.method === 'PUT')?.body).toMatchObject({
      bank: null,
      currentPassword: 'mat-khau-dai-123',
    });
  });

  it('checks the form before sending and focuses the first wrong field', async () => {
    const scrolled = vi.fn<(options?: ScrollIntoViewOptions) => void>();
    Element.prototype.scrollIntoView = scrolled;
    const calls = stubApi(ownerSettings());
    await renderPage();
    await userEvent.selectOptions(screen.getByLabelText('Ngân hàng'), '970436');
    await userEvent.type(screen.getByLabelText('Số tài khoản'), '12345');
    await userEvent.type(screen.getByLabelText('Tên chủ tài khoản'), 'Ánh');
    await userEvent.click(saveButton());
    expect(screen.getByText('Số tài khoản gồm 6 đến 19 chữ số.')).toBeTruthy();
    expect(screen.getByText('Kiểm tra lại các ô báo đỏ rồi lưu lại.')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText('Số tài khoản'));
    // Centred, so the sticky save bar cannot cover the field it points at.
    expect(scrolled).toHaveBeenCalledWith({ block: 'center' });
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    await userEvent.type(screen.getByLabelText('Số tài khoản'), '6');
    expect(screen.queryByText('Số tài khoản gồm 6 đến 19 chữ số.')).toBeNull();
    expect(screen.queryByText('Kiểm tra lại các ô báo đỏ rồi lưu lại.')).toBeNull();
  });

  it('flags a closing time that is not after the opening time', async () => {
    stubApi(ownerSettings());
    await renderPage();
    const close = screen.getByLabelText('Giờ đóng cửa ngày Thứ Ba');
    await fireEvent.update(close, '09:00');
    await fireEvent.change(close);
    await userEvent.click(saveButton());
    expect(screen.getByText('Giờ đóng cửa phải sau giờ mở cửa.')).toBeTruthy();
    expect(close.getAttribute('aria-invalid')).toBe('true');
  });

  it('shows the API’s field errors when the server refuses the values', async () => {
    stubApi(ownerSettings(), () =>
      jsonResponse(
        {
          code: 'VALIDATION_FAILED',
          fields: [{ path: 'rules.anomaly.minMainPerPerson', code: 'custom' }],
        },
        422,
      ),
    );
    await renderPage();
    await userEvent.click(screen.getByText('Không cần duyệt'));
    await userEvent.click(saveButton());
    expect(await screen.findByText('Mức tối thiểu không được lớn hơn mức tối đa.')).toBeTruthy();
  });

  it('says so when saving fails for another reason, keeping the changes', async () => {
    stubApi(ownerSettings(), () => jsonResponse({ code: 'INTERNAL' }, 500));
    await renderPage();
    await userEvent.click(screen.getByText('Nhân viên mở bàn'));
    await userEvent.click(saveButton());
    expect(await screen.findByText('Có lỗi xảy ra. Vui lòng thử lại.')).toBeTruthy();
    expect(screen.getByText(/Bạn có thay đổi chưa lưu/)).toBeTruthy();
  });

  it('a network failure while saving says to check the connection', async () => {
    stubApi(ownerSettings(), () => {
      throw new TypeError('offline');
    });
    await renderPage();
    await userEvent.click(screen.getByText('Nhân viên mở bàn'));
    await userEvent.click(saveButton());
    expect(await screen.findByText(/Không kết nối được máy chủ/)).toBeTruthy();
  });

  it('asks before leaving with unsaved changes; staying keeps them, leaving goes', async () => {
    stubApi(ownerSettings());
    const { router } = await renderRouted();
    await userEvent.click(screen.getByText('Nhân viên mở bàn'));
    const blocked = router.push('/quan-ly');
    const sheet = await screen.findByRole('dialog', { name: 'Rời trang khi chưa lưu?' });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Huỷ' }));
    await blocked;
    expect(router.currentRoute.value.path).toBe('/quan-ly/cai-dat');
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    const leaving = router.push('/quan-ly');
    await userEvent.click(await screen.findByRole('button', { name: 'Rời trang, bỏ thay đổi' }));
    await leaving;
    expect(router.currentRoute.value.path).toBe('/quan-ly');
  });

  it('leaves without asking when nothing changed', async () => {
    stubApi(ownerSettings());
    const { router } = await renderRouted();
    await router.push('/quan-ly');
    expect(router.currentRoute.value.path).toBe('/quan-ly');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('tells non-owners the page is for the owner only', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ code: 'FORBIDDEN' }, 403))),
    );
    await renderWithApp(SettingsPage, { paths: PATHS, at: '/quan-ly/cai-dat' });
    expect(await screen.findByText('Chỉ chủ quán xem và đổi được cài đặt.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it('shows a loading state, then an error with a retry that loads again', async () => {
    let fail = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          fail ? jsonResponse({ code: 'INTERNAL' }, 500) : jsonResponse(ownerSettings()),
        ),
      ),
    );
    await renderWithApp(SettingsPage, { paths: PATHS, at: '/quan-ly/cai-dat' });
    expect(screen.getByText(/Đang tải cài đặt/)).toBeTruthy();
    expect(await screen.findByText('Không tải được cài đặt.')).toBeTruthy();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('heading', { name: 'Thanh toán' })).toBeTruthy();
  });
  describe('the bank sheet asks for the owner’s password (TQR-023)', () => {
    const confirmIn = (sheet: HTMLElement) =>
      within(sheet).getByRole('button', { name: 'Đúng, lưu tài khoản này' });

    it('is a password field for the current password, focused when the sheet opens', async () => {
      stubApi(ownerSettings());
      await renderPage();
      const sheet = await openBankSheet();
      const field = within(sheet).getByLabelText(PASSWORD_LABEL) as HTMLInputElement;
      expect(field.type).toBe('password');
      expect(field.autocomplete).toBe('current-password');
      expect(within(sheet).getByText(/chính chủ quán/)).toBeTruthy();
      await nextTick();
      expect(document.activeElement).toBe(field);
    });

    it('an empty password is refused on the spot, nothing is sent', async () => {
      const calls = stubApi(ownerSettings());
      await renderPage();
      const sheet = await openBankSheet();
      await userEvent.click(confirmIn(sheet));
      expect(within(sheet).getByText('Nhập mật khẩu để xác nhận.')).toBeTruthy();
      const field = within(sheet).getByLabelText(PASSWORD_LABEL);
      expect(field.getAttribute('aria-invalid')).toBe('true');
      expect(document.activeElement).toBe(field);
      expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    });

    it('a wrong password shows inline, keeps the sheet open and empties the field', async () => {
      const calls = stubApi(ownerSettings(), () => jsonResponse({ code: 'REAUTH_FAILED' }, 403));
      await renderPage();
      const sheet = await openBankSheet();
      const field = within(sheet).getByLabelText(PASSWORD_LABEL) as HTMLInputElement;
      await userEvent.type(field, 'sai-mat-khau{Enter}');
      expect(
        await within(sheet).findByText('Mật khẩu không đúng. Kiểm tra lại rồi thử lần nữa.'),
      ).toBeTruthy();
      expect(screen.getByRole('dialog', { name: 'Đổi tài khoản nhận tiền?' })).toBe(sheet);
      expect(field.value).toBe('');
      expect(document.activeElement).toBe(field);
      expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
      expect(screen.getByText(/Bạn có thay đổi chưa lưu/)).toBeTruthy();
    });

    it('too many wrong passwords says to wait 15 minutes', async () => {
      stubApi(ownerSettings(), () => jsonResponse({ code: 'LOGIN_BLOCKED' }, 429));
      await renderPage();
      const sheet = await openBankSheet();
      await userEvent.type(within(sheet).getByLabelText(PASSWORD_LABEL), 'mat-khau-dai-123');
      await userEvent.click(confirmIn(sheet));
      expect(await within(sheet).findByText(/Hãy thử lại sau 15 phút/)).toBeTruthy();
    });

    it('the server asking for the password again shows the same inline message', async () => {
      stubApi(ownerSettings(), () =>
        jsonResponse(
          { code: 'REAUTH_REQUIRED', fields: [{ path: 'currentPassword', code: 'required' }] },
          422,
        ),
      );
      await renderPage();
      const sheet = await openBankSheet();
      await userEvent.type(within(sheet).getByLabelText(PASSWORD_LABEL), 'x');
      await userEvent.click(confirmIn(sheet));
      expect(await within(sheet).findByText('Nhập mật khẩu để xác nhận.')).toBeTruthy();
    });

    it('the password is never kept: not after cancel, not after saving, not in storage', async () => {
      stubApi(ownerSettings());
      await renderPage();
      let sheet = await openBankSheet();
      await userEvent.type(within(sheet).getByLabelText(PASSWORD_LABEL), 'mat-khau-dai-123');
      await userEvent.click(within(sheet).getByRole('button', { name: 'Huỷ' }));
      await userEvent.click(saveButton());
      sheet = screen.getByRole('dialog', { name: 'Đổi tài khoản nhận tiền?' });
      const field = within(sheet).getByLabelText(PASSWORD_LABEL) as HTMLInputElement;
      expect(field.value).toBe('');
      await userEvent.type(field, 'mat-khau-dai-123');
      await userEvent.click(confirmIn(sheet));
      expect(await screen.findByText(/Đã lưu/)).toBeTruthy();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(JSON.stringify({ ...localStorage })).not.toContain('mat-khau');
      expect(JSON.stringify({ ...sessionStorage })).not.toContain('mat-khau');
      expect(document.body.innerHTML).not.toContain('mat-khau');
    });

    it('a failure other than the password closes the sheet and says so', async () => {
      stubApi(ownerSettings(), () => jsonResponse({ code: 'INTERNAL' }, 500));
      await renderPage();
      const sheet = await openBankSheet();
      await userEvent.type(within(sheet).getByLabelText(PASSWORD_LABEL), 'mat-khau-dai-123');
      await userEvent.click(confirmIn(sheet));
      expect(await screen.findByText('Có lỗi xảy ra. Vui lòng thử lại.')).toBeTruthy();
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});
