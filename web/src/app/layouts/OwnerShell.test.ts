import { screen, within } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import OwnerShell from './OwnerShell.vue';
import StaffShell from './StaffShell.vue';
import { jsonResponse, renderWithApp } from '@/test/render';
import type { Me, StaffRole } from '@/stores/session';

const meAs = (role: StaffRole): Me => ({
  user: { id: 'u', email: 'e', role, displayName: '' },
  restaurant: { id: 'r', name: 'Quán Ngon', slug: 'quan-ngon' },
});

const navLinks = () =>
  within(screen.getByRole('navigation', { name: 'Quản lý nhà hàng' }))
    .getAllByRole('link')
    .map((link) => [link.textContent.trim(), link.getAttribute('href')]);

describe('OwnerShell', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the restaurant, the five owner sections and signs out to the sign-in page', async () => {
    const { router } = await renderWithApp(OwnerShell, {
      guarded: true,
      at: '/quan-ly',
      me: meAs('owner'),
      slots: { default: 'Nội dung' },
    });
    expect(await screen.findByText('Quán Ngon')).toBeTruthy();
    expect(navLinks()).toEqual([
      ['Tổng quan', '/quan-ly'],
      ['Thực đơn', '/quan-ly/thuc-don'],
      ['Bàn & QR', '/quan-ly/ban'],
      ['Nhân viên', '/quan-ly/nhan-vien'],
      ['Cài đặt', '/quan-ly/cai-dat'],
    ]);
    expect(screen.getByRole('link', { name: 'Tổng quan' }).className).toContain(
      'owner-shell__link--active',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(null, 204))),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/dang-nhap'));
  });

  it.each([
    ['waiter', 'Phục vụ', '/phuc-vu'],
    ['cashier', 'Thu ngân', '/thu-ngan'],
  ] as const)(
    'D5 shows a %s only the pages their role can open: their home and Bàn & QR',
    async (role, homeLabel, home) => {
      await renderWithApp(OwnerShell, {
        guarded: true,
        at: '/quan-ly/ban',
        me: meAs(role),
        slots: { default: 'Nội dung' },
      });
      await screen.findByText('Quán Ngon');
      expect(navLinks()).toEqual([
        [homeLabel, home],
        ['Bàn & QR', '/quan-ly/ban'],
      ]);
    },
  );
});

describe('StaffShell', () => {
  it.each(['waiter', 'cashier'] as const)(
    'D5 gives a %s a link to Bàn & QR from their home',
    async (role) => {
      await renderWithApp(StaffShell, {
        guarded: true,
        at: role === 'waiter' ? '/phuc-vu' : '/thu-ngan',
        me: meAs(role),
        props: { title: 'Trang' },
      });
      expect((await screen.findByRole('link', { name: 'Bàn & QR' })).getAttribute('href')).toBe(
        '/quan-ly/ban',
      );
    },
  );

  it('shows no Bàn & QR link to the kitchen', async () => {
    await renderWithApp(StaffShell, {
      guarded: true,
      at: '/bep',
      me: meAs('kitchen'),
      props: { title: 'Bếp' },
    });
    await screen.findByText('Quán Ngon');
    expect(screen.queryByRole('link', { name: 'Bàn & QR' })).toBeNull();
  });
});
