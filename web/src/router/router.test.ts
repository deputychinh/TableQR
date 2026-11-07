import { createPinia, setActivePinia } from 'pinia';
import type { RouteLocationNormalized } from 'vue-router';
import { sessionGuard } from './index';
import { useSessionStore } from '@/stores/session';
import { jsonResponse } from '@/test/render';

const route = (fullPath: string, meta: Record<string, unknown>) =>
  ({ fullPath, meta }) as unknown as RouteLocationNormalized;

describe('sessionGuard', () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(() => vi.unstubAllGlobals());

  it('sends a signed-out visitor of a staff page to sign-in, keeping the target', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ code: 'UNAUTHORIZED' }, 401))),
    );
    await expect(sessionGuard(route('/quan-ly/ban', { staff: true }))).resolves.toEqual({
      path: '/dang-nhap',
      query: { next: '/quan-ly/ban' },
    });
  });

  it('lets signed-in staff through and keeps them off the sign-in page', async () => {
    useSessionStore().me = {
      user: { id: 'u', email: 'e', role: 'owner', displayName: '' },
      restaurant: null,
    };
    await expect(sessionGuard(route('/quan-ly', { staff: true }))).resolves.toBe(true);
    await expect(sessionGuard(route('/dang-nhap', { guestOnly: true }))).resolves.toEqual({
      path: '/quan-ly',
    });
  });

  it('does not call the API for public pages', async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(sessionGuard(route('/', {}))).resolves.toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
