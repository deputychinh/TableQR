import { render, type RenderOptions } from '@testing-library/vue';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { i18n } from '@/locales';

/** Renders with i18n, a fresh Pinia and a memory router that knows the given paths. */
export const renderWithApp = async (
  component: unknown,
  options: RenderOptions<unknown> & { paths?: string[]; at?: string } = {},
): Promise<ReturnType<typeof render> & { router: Router; pinia: Pinia }> => {
  const pinia = createPinia();
  setActivePinia(pinia);
  const stub = { template: '<div>stub</div>' };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [...new Set(['/', ...(options.paths ?? [])])].map((path) => ({
      path,
      component: stub,
    })),
  });
  await router.push(options.at ?? '/');
  const { paths: _paths, at: _at, ...renderOptions } = options;
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
