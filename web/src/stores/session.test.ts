import { createPinia, setActivePinia } from 'pinia';
import { useSessionStore } from './session';
import { jsonResponse } from '@/test/render';

const me = {
  user: { id: 'u1', email: 'a@b.vn', role: 'owner', displayName: '' },
  restaurant: { id: 'r1', name: 'Quán A', slug: 'quan-a' },
};

describe('session store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the signed-in staff member', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(me))),
    );
    const store = useSessionStore();
    await expect(store.load()).resolves.toEqual(me);
    expect(store.me).toEqual(me);
  });

  it('treats 401 as signed out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ code: 'UNAUTHORIZED' }, 401))),
    );
    const store = useSessionStore();
    await expect(store.load()).resolves.toBeNull();
  });

  it('rethrows other failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ code: 'INTERNAL' }, 500))),
    );
    await expect(useSessionStore().load()).rejects.toMatchObject({ code: 'INTERNAL' });
  });

  it('signs up, signs in and signs out through the API', async () => {
    const calls: [string, string][] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init: RequestInit) => {
        calls.push([init.method ?? 'GET', url]);
        return Promise.resolve(
          url.endsWith('/logout') ? jsonResponse(null, 204) : jsonResponse(me),
        );
      }),
    );
    const store = useSessionStore();
    await store.signUp({ restaurantName: 'Quán A', email: 'a@b.vn', password: '1234567890' });
    expect(store.me).toEqual(me);
    await store.signIn({ email: 'a@b.vn', password: '1234567890' });
    await store.signOut();
    expect(store.me).toBeNull();
    expect(calls).toEqual([
      ['POST', '/api/auth/signup'],
      ['POST', '/api/auth/login'],
      ['POST', '/api/auth/logout'],
    ]);
  });
});
