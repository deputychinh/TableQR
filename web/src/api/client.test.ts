import { ApiError, getJson, sendJson, setUnauthorizedHandler } from './client';

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

describe('unauthorized handler (AC16: a session ended elsewhere)', () => {
  afterEach(() => setUnauthorizedHandler(undefined));

  it('is called when a signed-in call answers 401, and the error still reaches the caller', async () => {
    const handler = vi.fn<() => void>();
    setUnauthorizedHandler(handler);
    await expect(
      sendJson('PATCH', '/staff/1', {}, respond('{"code":"UNAUTHORIZED"}', 401)),
    ).rejects.toMatchObject({ status: 401 });
    expect(handler).toHaveBeenCalledOnce();
  });

  it('is not called for sign-in, /me or other errors', async () => {
    const handler = vi.fn<() => void>();
    setUnauthorizedHandler(handler);
    await getJson('/me', respond('{"code":"UNAUTHORIZED"}', 401)).catch(() => undefined);
    await sendJson('POST', '/auth/login', {}, respond('{"code":"INVALID_CREDENTIALS"}', 401)).catch(
      () => undefined,
    );
    await getJson('/staff', respond('{"code":"FORBIDDEN"}', 403)).catch(() => undefined);
    expect(handler).not.toHaveBeenCalled();
  });
});
