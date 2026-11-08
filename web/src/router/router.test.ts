import { createPinia, setActivePinia } from 'pinia';
import type { RouteLocationNormalized } from 'vue-router';
import router, { onSessionEnded, sessionGuard } from './index';
import { setUnauthorizedHandler, sendJson } from '@/api/client';
import type { StaffRole } from '@/stores/session';
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

  const signedInAs = (role: StaffRole) => {
    useSessionStore().me = {
      user: { id: 'u', email: 'e', role, displayName: '' },
      restaurant: role === 'platform_admin' ? null : { id: 'r', name: 'Q', slug: 'q' },
    };
  };

  it.each([
    ['owner', '/quan-ly'],
    ['cashier', '/thu-ngan'],
    ['waiter', '/phuc-vu'],
    ['kitchen', '/bep'],
    ['platform_admin', '/quan-tri'],
  ] as const)('AC14 sends a signed-in %s from sign-in to %s', async (role, home) => {
    signedInAs(role);
    await expect(sessionGuard(route('/dang-nhap', { guestOnly: true }))).resolves.toEqual({
      path: home,
    });
  });

  it('keeps a kitchen user off owner pages, including pages without a role list', async () => {
    signedInAs('kitchen');
    await expect(
      sessionGuard(route('/quan-ly/nhan-vien', { staff: true, roles: ['owner'] })),
    ).resolves.toEqual({ path: '/bep' });
    await expect(sessionGuard(route('/quan-ly/thuc-don', { staff: true }))).resolves.toEqual({
      path: '/bep',
    });
    await expect(sessionGuard(route('/bep', { staff: true, roles: ['kitchen'] }))).resolves.toBe(
      true,
    );
  });

  it('keeps an owner off the platform admin page', async () => {
    signedInAs('owner');
    await expect(
      sessionGuard(route('/quan-tri', { staff: true, roles: ['platform_admin'] })),
    ).resolves.toEqual({ path: '/quan-ly' });
  });

  it('AC16 a 401 from any call forgets the session and goes to sign-in keeping the page', async () => {
    signedInAs('kitchen');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ code: 'UNAUTHORIZED' }, 401))),
    );
    await router.push('/bep').catch(() => undefined);
    useSessionStore().me = {
      user: { id: 'u', email: 'e', role: 'kitchen', displayName: '' },
      restaurant: null,
    };
    await router.push('/bep');
    await sendJson('POST', '/kitchen/x').catch(() => undefined);
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/dang-nhap'));
    expect(router.currentRoute.value.query.next).toBe('/bep');
    expect(useSessionStore().me).toBeNull();
  });

  it('a 401 on a public page only forgets the session', async () => {
    await router.push('/');
    signedInAs('owner');
    await onSessionEnded();
    expect(router.currentRoute.value.path).toBe('/');
    expect(useSessionStore().me).toBeNull();
    setUnauthorizedHandler(undefined);
  });

  it('keeps main’s routes right: guest table page public, tables readable and printable by floor staff', () => {
    expect(router.resolve('/t/some-token').meta.staff).toBeUndefined();
    expect(router.resolve('/quan-ly/ban').meta.roles).toEqual(['owner', 'cashier', 'waiter']);
    expect(router.resolve('/quan-ly/ban/in').meta.roles).toEqual(['owner', 'cashier', 'waiter']);
    expect(router.resolve('/quan-ly/cai-dat').meta.roles).toEqual(['owner']);
    expect(router.resolve('/quan-ly/nhan-vien').meta.roles).toEqual(['owner']);
  });

  it('does not call the API for public pages', async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(sessionGuard(route('/', {}))).resolves.toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
