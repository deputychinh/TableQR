import { render, type RenderOptions } from '@testing-library/vue';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createMemoryHistory, createRouter, type Router, type RouteRecordRaw } from 'vue-router';
import { i18n } from '@/locales';
import { useSessionStore, type Me } from '@/stores/session';

const stub = { template: '<div>stub</div>' };

/**
 * Every real route (path, name and meta) with a stub component, guarded by the real
 * `sessionGuard` — so a test sees where the app would really let a role go.
 */
const guardedRouter = async (): Promise<Router> => {
  const [{ coreRoutes, featureRoutes }, { sessionGuard }] = await Promise.all([
    import('@/router/routes'),
    import('@/router'),
  ]);
  const routes = [...coreRoutes, ...featureRoutes].map(
    (route) =>
      ({ path: route.path, name: route.name, meta: route.meta, component: stub }) as RouteRecordRaw,
  );
  const router = createRouter({ history: createMemoryHistory(), routes });
  router.beforeEach(sessionGuard);
  return router;
};

/**
 * Renders with i18n, a fresh Pinia and a memory router. By default the router knows only the given
 * paths and has no guard; `guarded: true` uses the real route table and session guard, with `me`
 * as the signed-in person.
 */
export const renderWithApp = async (
  component: unknown,
  options: RenderOptions<unknown> & {
    paths?: string[];
    at?: string;
    guarded?: boolean;
    me?: Me;
  } = {},
): Promise<ReturnType<typeof render> & { router: Router; pinia: Pinia }> => {
  const pinia = createPinia();
  setActivePinia(pinia);
  if (options.me) useSessionStore().me = options.me;
  const router = options.guarded
    ? await guardedRouter()
    : createRouter({
        history: createMemoryHistory(),
        routes: [...new Set(['/', ...(options.paths ?? [])])].map((path) => ({
          path,
          component: stub,
        })),
      });
  await router.push(options.at ?? '/');
  const { paths: _paths, at: _at, guarded: _guarded, me: _me, ...renderOptions } = options;
  const result = render(
    component as Parameters<typeof render>[0],
    {
      ...renderOptions,
      global: { ...renderOptions.global, plugins: [i18n, pinia, router] },
    } as RenderOptions<unknown>,
  );
  return { ...result, router, pinia };
};

export const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
