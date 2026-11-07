import { Controller, Get } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, type TestApp } from './support/app.js';

@Controller('test-errors')
class ThrowingController {
  @Get('boom')
  boom(): never {
    throw new Error('secret internal detail: connection string postgres://u:p@h/db');
  }
}

describe('problem details and request logs (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ controllers: [ThrowingController] });
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('answers an unknown route with a 404 problem and code NOT_FOUND', async () => {
    const response = await request(t.app.getHttpServer()).get('/api/nope').expect(404);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.body).toMatchObject({ status: 404, code: 'NOT_FOUND', title: 'Not Found' });
    expect(response.body.type).toBeTypeOf('string');
    expect(JSON.stringify(response.body)).not.toMatch(/stack|at .*\.js/);
  });

  it('hides an unexpected error behind a generic 500 problem and logs it with the request id', async () => {
    const response = await request(t.app.getHttpServer())
      .get('/api/test-errors/boom')
      .set('x-request-id', 'req-abc-123')
      .expect(500);
    expect(response.body).toMatchObject({ status: 500, code: 'INTERNAL' });
    expect(JSON.stringify(response.body)).not.toContain('secret internal detail');
    expect(response.headers['x-request-id']).toBe('req-abc-123');
    const errorLog = t.logs.find((l) => l.msg === 'unhandled_error');
    expect(errorLog).toMatchObject({ level: 'error', reqId: 'req-abc-123' });
  });

  it('rejects a JSON body above 32 kB with 413 PAYLOAD_TOO_LARGE', async () => {
    const big = { text: 'x'.repeat(33 * 1024) };
    const response = await request(t.app.getHttpServer()).post('/api/health').send(big).expect(413);
    expect(response.body).toMatchObject({ status: 413, code: 'PAYLOAD_TOO_LARGE' });
  });

  it('answers a malformed JSON body with 400 INVALID_JSON', async () => {
    const response = await request(t.app.getHttpServer())
      .post('/api/health')
      .set('content-type', 'application/json')
      .send('{"a":')
      .expect(400);
    expect(response.body).toMatchObject({ status: 400, code: 'INVALID_JSON' });
  });

  it('logs one line per request with the route pattern, never the raw path', async () => {
    t.logs.length = 0;
    await request(t.app.getHttpServer()).get('/api/health?token=abc').expect(200);
    const line = t.logs.find((l) => l.msg === 'request');
    expect(line).toMatchObject({ level: 'info', method: 'GET', route: '/api/health', status: 200 });
    expect(line?.reqId).toMatch(/^[0-9a-f-]{36}$/);
    expect(line?.ms).toBeTypeOf('number');
    expect(JSON.stringify(t.logs)).not.toContain('token=abc');
  });

  it('logs unmatched routes without their path', async () => {
    t.logs.length = 0;
    await request(t.app.getHttpServer()).get('/api/g/t/SECRET-QR-TOKEN').expect(404);
    expect(JSON.stringify(t.logs)).not.toContain('SECRET-QR-TOKEN');
    expect(t.logs.find((l) => l.msg === 'request')).toMatchObject({ route: '(unmatched)' });
  });

  it('replaces an unsafe incoming request id with a fresh uuid', async () => {
    const response = await request(t.app.getHttpServer())
      .get('/api/health')
      .set('x-request-id', 'bad id with spaces '.repeat(5))
      .expect(200);
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
