import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { API_SECURITY_HEADERS, HSTS_VALUE } from '../src/common/http/security-headers.js';
import { createTestApp, type TestApp } from './support/app.js';
import { ORIGIN, signUp } from './support/http.js';

/** What every API response must carry (TQR-022); header names compared in lower case. */
const EXPECTED = Object.fromEntries(
  Object.entries(API_SECURITY_HEADERS).map(([name, value]) => [name.toLowerCase(), value]),
);

const expectSecurityHeaders = (headers: Record<string, unknown>) => {
  expect(headers).toMatchObject(EXPECTED);
  expect(headers['x-powered-by']).toBeUndefined();
};

describe('production security headers (e2e, TQR-022)', () => {
  let t: TestApp;
  let base: string;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp({}, { TQR_HSTS: 'false', TQR_TRUSTED_PROXIES: '' });
    await t.app.listen(0, '127.0.0.1');
    const server = t.app.getHttpServer() as unknown as { address: () => AddressInfo };
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('a normal JSON response carries the full set, no X-Powered-By and no HSTS locally', async () => {
    const response = await http().get('/api/health').expect(200);
    expectSecurityHeaders(response.headers);
    expect(response.headers['strict-transport-security']).toBeUndefined();
  });

  it('a problem response (401, 404, 422 and a refused Origin) carries the full set', async () => {
    const unauthorized = await http().get('/api/me').expect(401);
    expect(unauthorized.headers['content-type']).toContain('application/problem+json');
    expectSecurityHeaders(unauthorized.headers);
    expectSecurityHeaders((await http().get('/api/no-such-route').expect(404)).headers);
    const invalid = await http().post('/api/auth/login').set('origin', ORIGIN).send({}).expect(422);
    expectSecurityHeaders(invalid.headers);
    const foreign = await http()
      .post('/api/auth/login')
      .set('origin', 'https://evil.example')
      .send({ email: 'a@example.com', password: 'x' })
      .expect(403);
    expectSecurityHeaders(foreign.headers);
  });

  it('a server-sent event stream carries the full set', async () => {
    const { cookie } = await signUp(t);
    const controller = new AbortController();
    const response = await fetch(`${base}/api/stream/floor`, {
      headers: { cookie },
      signal: controller.signal,
    });
    try {
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');
      expectSecurityHeaders(Object.fromEntries(response.headers));
    } finally {
      controller.abort();
    }
  });
});

describe('HSTS when TQR_HSTS=true (e2e, TQR-022)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({}, { TQR_HSTS: 'true' });
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('adds Strict-Transport-Security to every response', async () => {
    const ok = await request(t.app.getHttpServer()).get('/api/health').expect(200);
    expect(ok.headers['strict-transport-security']).toBe(HSTS_VALUE);
    const problem = await request(t.app.getHttpServer()).get('/api/me').expect(401);
    expect(problem.headers['strict-transport-security']).toBe(HSTS_VALUE);
  });
});

/**
 * The sign-in limit is keyed by the client address. Without a trusted proxy a client must not be
 * able to choose its key with `X-Forwarded-For`; behind a trusted proxy the forwarded address is
 * the real client and is the key.
 */
describe('rate-limit key behind a proxy (e2e, TQR_TRUSTED_PROXIES)', () => {
  const LIMIT = '2';
  const login = (t: TestApp, forwardedFor: string) =>
    request(t.app.getHttpServer())
      .post('/api/auth/login')
      .set('origin', ORIGIN)
      .set('x-forwarded-for', forwardedFor)
      .send({ email: `nobody-${forwardedFor}@example.com`, password: 'sai-mat-khau-1' });

  it('unset: a spoofed X-Forwarded-For does not change the key (the third call is refused)', async () => {
    const t = await createTestApp(
      {},
      { TQR_TRUSTED_PROXIES: '', TQR_AUTH_RATE_LIMIT_PER_MINUTE: LIMIT },
    );
    try {
      expect((await login(t, '203.0.113.1')).status).toBe(401);
      expect((await login(t, '203.0.113.2')).status).toBe(401);
      const third = await login(t, '203.0.113.3');
      expect(third.status).toBe(429);
      expect(third.body.code).toBe('TOO_MANY_REQUESTS');
    } finally {
      await t.app.close();
    }
  });

  it('set to 127.0.0.1: the forwarded client address is the key', async () => {
    const t = await createTestApp(
      {},
      { TQR_TRUSTED_PROXIES: '127.0.0.1', TQR_AUTH_RATE_LIMIT_PER_MINUTE: LIMIT },
    );
    try {
      expect((await login(t, '203.0.113.1')).status).toBe(401);
      expect((await login(t, '203.0.113.1')).status).toBe(401);
      // The same client again is over its limit …
      expect((await login(t, '203.0.113.1')).status).toBe(429);
      // … while another client behind the same proxy still gets through.
      expect((await login(t, '203.0.113.2')).status).toBe(401);
    } finally {
      await t.app.close();
    }
  });
});
