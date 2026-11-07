import { ApiError, getJson } from './client';

const respond = (body: string, status = 200) =>
  (() => Promise.resolve(new Response(body, { status }))) as typeof fetch;

describe('getJson', () => {
  it('calls the same-origin /api base', async () => {
    const calls: string[] = [];
    const spy = ((url: string) => {
      calls.push(url);
      return Promise.resolve(new Response('{"ok":true}'));
    }) as typeof fetch;
    await expect(getJson('/health', spy)).resolves.toEqual({ ok: true });
    expect(calls).toEqual(['/api/health']);
  });

  it('exposes the problem code of an error response', async () => {
    const error = await getJson('/x', respond('{"code":"NOT_FOUND","status":404}', 404)).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('falls back to HTTP_ERROR when the error body is not JSON', async () => {
    await expect(getJson('/x', respond('<html>bad gateway</html>', 502))).rejects.toMatchObject({
      status: 502,
      code: 'HTTP_ERROR',
    });
  });

  it('maps a network failure to status 0 NETWORK', async () => {
    const offline = (() => Promise.reject(new TypeError('offline'))) as typeof fetch;
    await expect(getJson('/x', offline)).rejects.toMatchObject({ status: 0, code: 'NETWORK' });
  });
});
