import { render, screen } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { Wallet } from 'lucide-vue-next';
import ConfirmSheet from '@/components/ConfirmSheet.vue';
import StatusChip from '@/components/StatusChip.vue';
import { i18n } from '@/locales';
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

describe('ConfirmSheet', () => {
  const renderSheet = (props: Record<string, unknown>) =>
    render(ConfirmSheet, {
      props: { open: false, title: 'Khoá?', body: 'Hậu quả', confirmLabel: 'Khoá', ...props },
      global: { plugins: [i18n] },
    });

  it('is a named dialog that confirms and cancels', async () => {
    const view = renderSheet({ open: true });
    const dialog = await screen.findByRole('dialog', { name: 'Khoá?' });
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Khoá' }));
    await userEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(view.emitted('confirm')).toHaveLength(1);
    expect(view.emitted('cancel')).toHaveLength(1);
  });

  it('opens and closes with its prop and cancels on Escape unless busy', async () => {
    const view = renderSheet({ open: false, body: undefined });
    expect(screen.queryByRole('dialog')).toBeNull();
    await view.rerender({ open: true });
    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('aria-describedby')).toBeNull();
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(view.emitted('cancel')).toHaveLength(1);
    await view.rerender({ open: true, busy: true });
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(view.emitted('cancel')).toHaveLength(1);
    await view.rerender({ open: false, busy: false });
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('shows an error message inside the sheet', async () => {
    renderSheet({ open: true, error: 'Không được' });
    expect((await screen.findByRole('alert')).textContent).toContain('Không được');
  });
});
