import { screen } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import OwnerShell from './OwnerShell.vue';
import { jsonResponse, renderWithApp } from '@/test/render';
import { useSessionStore } from '@/stores/session';

describe('OwnerShell', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the restaurant, the six sections and signs out to the sign-in page', async () => {
    const { router } = await renderWithApp(OwnerShell, {
      paths: [
        '/quan-ly',
        '/dang-nhap',
        '/quan-ly/thuc-don',
        '/quan-ly/ban',
        '/quan-ly/nhan-vien',
        '/quan-ly/cai-dat',
        '/dat-ban',
      ],
      at: '/quan-ly',
      slots: { default: 'Nội dung' },
    });
    useSessionStore().me = {
      user: { id: 'u', email: 'e', role: 'owner', displayName: '' },
      restaurant: { id: 'r', name: 'Quán Ngon', slug: 'quan-ngon' },
    };
    expect(await screen.findByText('Quán Ngon')).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Quản lý nhà hàng' });
    expect(nav.querySelectorAll('a')).toHaveLength(6);
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
});
