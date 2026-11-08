import { screen, within } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import OwnerShell from './OwnerShell.vue';
import RoleShell from './RoleShell.vue';
import StaffShell from './StaffShell.vue';
import { ROLE_NAV, isActive } from './navigation';
import { jsonResponse, renderWithApp } from '@/test/render';
import type { Me, StaffRole } from '@/stores/session';

const meAs = (role: StaffRole): Me => ({
  user: { id: 'u', email: 'e', role, displayName: '' },
  restaurant: { id: 'r', name: 'Quán Ngon', slug: 'quan-ngon' },
});

const nav = () => screen.queryByRole('navigation', { name: 'Quản lý nhà hàng' });
const navLinks = () =>
  within(screen.getByRole('navigation', { name: 'Quản lý nhà hàng' }))
    .getAllByRole('link')
    .map((link) => [link.textContent.trim(), link.getAttribute('href')]);

const OWNER_LINKS = [
  ['Tổng quan', '/quan-ly'],
  ['Thực đơn', '/quan-ly/thuc-don'],
  ['Bàn & QR', '/quan-ly/ban'],
  ['Đặt bàn', '/dat-ban'],
  // Behind "Thêm" on phones, on the rail from 840 px:
  ['Nhân viên', '/quan-ly/nhan-vien'],
  ['Cài đặt', '/quan-ly/cai-dat'],
  ['Thu ngân', '/thu-ngan'],
  ['Bếp', '/bep'],
  ['Phục vụ', '/phuc-vu'],
  ['Duyệt đơn', '/phuc-vu/duyet'],
];

describe('navigation model', () => {
  it('keeps every phone bottom bar at five items or fewer (Material 3)', () => {
    for (const role of Object.keys(ROLE_NAV) as StaffRole[]) {
      const { primary, more, operations } = ROLE_NAV[role];
      const moreTab = more.length + operations.length > 0 ? 1 : 0;
      expect(primary.length + moreTab).toBeLessThanOrEqual(5);
    }
  });

  it('marks a section active on its sub-pages, an exact item only on its own path', () => {
    const [overview, menu] = ROLE_NAV.owner.primary;
    expect(overview && isActive(overview, '/quan-ly/ban')).toBe(false);
    expect(menu && isActive(menu, '/quan-ly/thuc-don/xem-truoc')).toBe(true);
    const serving = ROLE_NAV.waiter.primary[0];
    expect(serving && isActive(serving, '/phuc-vu/duyet')).toBe(false);
  });
});

describe('OwnerShell', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the restaurant, the owner destinations and signs out to the sign-in page', async () => {
    const { router } = await renderWithApp(OwnerShell, {
      guarded: true,
      at: '/quan-ly',
      me: meAs('owner'),
      slots: { default: 'Nội dung' },
    });
    expect(await screen.findByText('Quán Ngon')).toBeTruthy();
    expect(navLinks()).toEqual(OWNER_LINKS);
    expect(screen.getByRole('link', { name: 'Tổng quan' }).className).toContain(
      'app-shell__link--active',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(null, 204))),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/dang-nhap'));
  });

  it('opens "Thêm" with the other pages, grouped Quản lý and Vận hành, and closes on navigation', async () => {
    const { router } = await renderWithApp(OwnerShell, {
      guarded: true,
      at: '/quan-ly/nhan-vien',
      me: meAs('owner'),
      slots: { default: 'Nội dung' },
    });
    const more = await within(nav() as HTMLElement).findByRole('button', { name: 'Thêm' });
    // A page behind "Thêm" lights the "Thêm" tab.
    expect(more.className).toContain('app-shell__link--active');
    await userEvent.click(more);
    const sheet = screen.getByRole('dialog', { name: 'Các trang khác' });
    expect(
      within(sheet)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(['Quản lý', 'Vận hành']);
    await userEvent.click(within(sheet).getByRole('link', { name: 'Thu ngân' }));
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/thu-ngan'));
    await vi.waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Các trang khác' })).toBeNull(),
    );
  });
});

describe('StaffShell', () => {
  it.each([
    [
      'waiter',
      '/phuc-vu/duyet',
      [
        ['Phục vụ', '/phuc-vu'],
        ['Duyệt đơn', '/phuc-vu/duyet'],
        ['Bàn & QR', '/quan-ly/ban'],
        ['Đặt bàn', '/dat-ban'],
      ],
    ],
    [
      'cashier',
      '/thu-ngan',
      [
        ['Thu ngân', '/thu-ngan'],
        ['Bàn & QR', '/quan-ly/ban'],
        ['Đặt bàn', '/dat-ban'],
      ],
    ],
  ] as const)('gives a %s their own navigation and no "Thêm"', async (role, at, links) => {
    await renderWithApp(StaffShell, {
      guarded: true,
      at,
      me: meAs(role),
      props: { title: 'Trang' },
    });
    await screen.findByText('Quán Ngon');
    expect(navLinks()).toEqual(links);
    expect(screen.queryByRole('button', { name: 'Thêm' })).toBeNull();
    expect(screen.getByText('Trang')).toBeTruthy();
  });

  it('gives the kitchen one screen and no navigation', async () => {
    await renderWithApp(StaffShell, {
      guarded: true,
      at: '/bep',
      me: meAs('kitchen'),
      props: { title: 'Bếp' },
    });
    await screen.findByText('Quán Ngon');
    expect(nav()).toBeNull();
    expect(screen.queryByRole('link', { name: 'Bàn & QR' })).toBeNull();
  });
});

describe('RoleShell', () => {
  it('gives the owner the owner shell on a floor screen', async () => {
    await renderWithApp(RoleShell, {
      guarded: true,
      at: '/thu-ngan',
      me: meAs('owner'),
      props: { title: 'Thu ngân' },
      slots: { default: 'Nội dung' },
    });
    await screen.findByText('Quán Ngon');
    expect(navLinks()).toEqual(OWNER_LINKS);
    expect(screen.getByRole('link', { name: 'Thu ngân' }).className).toContain(
      'app-shell__link--active',
    );
  });

  it('gives floor staff their titled staff shell', async () => {
    await renderWithApp(RoleShell, {
      guarded: true,
      at: '/thu-ngan',
      me: meAs('cashier'),
      props: { title: 'Thu ngân' },
      slots: { default: 'Nội dung' },
    });
    await screen.findByText('Quán Ngon');
    expect(navLinks()).toHaveLength(3);
    expect(screen.getAllByText('Thu ngân')).toHaveLength(2);
  });
});
