import { vi } from 'vitest';
import { jsonResponse } from './render';

type Reply = { status?: number; body?: unknown } | (() => Promise<Response>);

/**
 * Stubs `fetch` with a table of `'METHOD /api/path'` → reply; unknown calls answer 404.
 * Returns the recorded calls (method, path, parsed body) for assertions.
 */
export const fakeApi = (routes: Record<string, Reply>) => {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const spy = vi.fn<typeof fetch>((input, init) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, body });
    const reply = routes[`${method} ${path}`];
    if (reply === undefined) return Promise.resolve(jsonResponse({ code: 'NOT_FOUND' }, 404));
    if (typeof reply === 'function') return reply();
    return Promise.resolve(jsonResponse(reply.body ?? null, reply.status ?? 200));
  });
  vi.stubGlobal('fetch', spy);
  return calls;
};
