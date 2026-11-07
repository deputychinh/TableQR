import { render, screen } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { Wallet } from 'lucide-vue-next';
import StatusChip from '@/components/StatusChip.vue';
import { useSessionStore } from '@/stores/session';
import { jsonResponse, renderWithApp } from '@/test/render';
import RoleHomePage from './RoleHomePage.vue';
import { ROLE_HOME, canOpen, roleHome } from './role-home';

afterEach(() => vi.unstubAllGlobals());

describe('role homes (AC14)', () => {
  it('sends each role to its own screen', () => {
    expect(ROLE_HOME).toEqual({
      owner: '/quan-ly',
      cashier: '/thu-ngan',
      waiter: '/phuc-vu',
      kitchen: '/bep',
      platform_admin: '/quan-tri',
    });
    expect(roleHome('kitchen')).toBe('/bep');
  });

  it('treats staff pages without a role list as owner-only (deny by default)', () => {
    expect(canOpen('owner', undefined)).toBe(true);
    expect(canOpen('kitchen', undefined)).toBe(false);
    expect(canOpen('kitchen', ['kitchen'])).toBe(true);
    expect(canOpen('waiter', ['kitchen'])).toBe(false);
  });

  it('shows the kitchen placeholder in the staff shell and signs out', async () => {
    const { router } = await renderWithApp(RoleHomePage, {
      paths: ['/bep', '/dang-nhap'],
      at: '/bep',
      props: { role: 'kitchen' },
    });
    useSessionStore().me = {
      user: { id: 'u', email: 'b@example.com', role: 'kitchen', displayName: 'Anh Bếp' },
      restaurant: { id: 'r', name: 'Quán Ngon', slug: 'quan-ngon' },
    };
    expect(await screen.findByRole('heading', { name: 'Màn hình này sắp có' })).toBeTruthy();
    expect(screen.getByText('Bếp')).toBeTruthy();
    expect(screen.getByText('Quán Ngon')).toBeTruthy();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(null, 204))),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/dang-nhap'));
  });
});

describe('StatusChip', () => {
  it('shows the word (never colour alone) with an optional icon', () => {
    const { container } = render(StatusChip, {
      props: { label: 'Thu ngân', tone: 'danger', icon: Wallet },
    });
    expect(screen.getByText('Thu ngân').className).toContain('status-chip--danger');
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('is neutral without an icon by default', () => {
    const { container } = render(StatusChip, { props: { label: 'Bếp' } });
    expect(screen.getByText('Bếp').className).toContain('status-chip--neutral');
    expect(container.querySelector('svg')).toBeNull();
  });
});
