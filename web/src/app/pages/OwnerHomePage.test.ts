import { screen } from '@testing-library/vue';
import OwnerHomePage from './OwnerHomePage.vue';
import { renderWithApp } from '@/test/render';

describe('OwnerHomePage', () => {
  it('TQR-029: three setup steps; step 3 is "Chọn cách vận hành" with QR transfer optional', async () => {
    await renderWithApp(OwnerHomePage, {
      guarded: true,
      at: '/quan-ly',
      me: {
        user: { id: 'u', email: 'e', role: 'owner', displayName: '' },
        restaurant: { id: 'r', name: 'Quán Ngon', slug: 'quan-ngon' },
      },
    });
    const steps = screen.getAllByRole('listitem').slice(0, 3);
    expect(steps.map((step) => step.textContent)).toEqual([
      expect.stringContaining('Thêm thực đơn'),
      expect.stringContaining('Thêm bàn và in mã QR'),
      expect.stringContaining('Chọn cách vận hành'),
    ]);
    const third = screen.getByRole('link', { name: /Chọn cách vận hành/ });
    expect(third.getAttribute('href')).toBe('/quan-ly/cai-dat');
    // The bank account is not pushed as a setup duty: QR transfer is an option.
    expect(third.textContent).toContain('tuỳ chọn');
    expect(third.textContent).not.toMatch(/tài khoản/);
  });
});
