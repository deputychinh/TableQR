import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Post,
} from '@nestjs/common';
import { DomainError } from '../src/common/errors/domain.error.js';
import request from 'supertest';
import { createTestApp, type TestApp } from './support/app.js';

@Controller('test-errors')
class ThrowingController {
  @Get('boom')
  boom(): never {
    throw new Error('secret internal detail: connection string postgres://u:p@h/db');
  }

  @Get('driver')
  driver(): never {
    const pg = Object.assign(new Error('duplicate key'), { code: '23505', constraint: 'x_key' });
    const error = new Error('Failed query: insert …\nparams: Lan,0901234567', { cause: pg });
    error.name = 'DrizzleQueryError';
    throw error;
  }

  @Get('domain')
  domain(): never {
    throw new DomainError('EMAIL_TAKEN', 409, {
      detail: 'Email đã được dùng',
      extensions: { field: 'email' },
    });
  }

  @Get('http-code')
  httpCode(): never {
    throw new ConflictException({ code: 'SESSION_CLOSED' });
  }

  @Get('nest-message')
  nestMessage(): never {
    throw new BadRequestException('internal text from a library');
  }

  @Post('echo')
  @HttpCode(200)
  echo(@Body() body: { text?: string }): { length: number } {
    return { length: body.text?.length ?? 0 };
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
    expect(errorLog).toMatchObject({ level: 'error', reqId: 'req-abc-123', error: 'Error' });
    expect(response.body.instance).toBe('urn:tableqr:request:req-abc-123');
    expect(JSON.stringify(t.logs)).not.toContain('postgres://');
  });

  it('logs a failed query by name, driver code and constraint, never its SQL or params', async () => {
    t.logs.length = 0;
    await request(t.app.getHttpServer()).get('/api/test-errors/driver').expect(500);
    expect(t.logs.find((l) => l.msg === 'unhandled_error')).toMatchObject({
      error: 'DrizzleQueryError',
      dbCode: '23505',
      constraint: 'x_key',
    });
    expect(JSON.stringify(t.logs)).not.toMatch(/0901234567|Failed query/);
  });

  it('maps a DomainError to its status, code, detail and extensions', async () => {
    const response = await request(t.app.getHttpServer())
      .get('/api/test-errors/domain')
      .expect(409);
    expect(response.body).toMatchObject({
      status: 409,
      code: 'EMAIL_TAKEN',
      detail: 'Email đã được dùng',
      field: 'email',
      title: 'Conflict',
    });
  });

  it('keeps a custom code carried by a Nest HttpException', async () => {
    const response = await request(t.app.getHttpServer())
      .get('/api/test-errors/http-code')
      .expect(409);
    expect(response.body).toMatchObject({ status: 409, code: 'SESSION_CLOSED' });
  });

  it('answers a wrong method on a known route with a problem, not an HTML page', async () => {
    const response = await request(t.app.getHttpServer()).delete('/api/health').expect(404);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
  });

  const LIMIT_BYTES = 32 * 1024;
  const bodyOfBytes = (bytes: number): string => {
    const shell = JSON.stringify({ text: '' }).length;
    return JSON.stringify({ text: 'x'.repeat(bytes - shell) });
  };

  it('accepts a JSON body of exactly 32 768 bytes and rejects 32 769', async () => {
    const exact = bodyOfBytes(LIMIT_BYTES);
    expect(Buffer.byteLength(exact)).toBe(LIMIT_BYTES);
    await request(t.app.getHttpServer())
      .post('/api/test-errors/echo')
      .set('content-type', 'application/json')
      .send(exact)
      .expect(200);
    const over = bodyOfBytes(LIMIT_BYTES + 1);
    const response = await request(t.app.getHttpServer())
      .post('/api/test-errors/echo')
      .set('content-type', 'application/json')
      .send(over)
      .expect(413);
    expect(response.body.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('never echoes the message of a Nest HttpException', async () => {
    const response = await request(t.app.getHttpServer())
      .get('/api/test-errors/nest-message')
      .expect(400);
    expect(response.body).toMatchObject({ status: 400, code: 'BAD_REQUEST', title: 'Bad Request' });
    expect(JSON.stringify(response.body)).not.toContain('internal text');
  });

  it('replaces a short request id that contains unsafe characters', async () => {
    const response = await request(t.app.getHttpServer())
      .get('/api/health')
      .set('x-request-id', 'a b')
      .expect(200);
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('replaces a safe-looking request id longer than 64 characters', async () => {
    const response = await request(t.app.getHttpServer())
      .get('/api/health')
      .set('x-request-id', 'a'.repeat(65))
      .expect(200);
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('accepts a JSON body just under 32 kB', async () => {
    const text = 'x'.repeat(31 * 1024);
    const response = await request(t.app.getHttpServer())
      .post('/api/test-errors/echo')
      .send({ text })
      .expect(200);
    expect(response.body).toEqual({ length: text.length });
  });

  it('rejects a JSON body above 32 kB with 413 PAYLOAD_TOO_LARGE', async () => {
    const big = { text: 'x'.repeat(33 * 1024) };
    const response = await request(t.app.getHttpServer()).post('/api/health').send(big).expect(413);
    expect(response.body).toMatchObject({ status: 413, code: 'PAYLOAD_TOO_LARGE' });
  });

  it('answers an unsupported content encoding with 415', async () => {
    const response = await request(t.app.getHttpServer())
      .post('/api/test-errors/echo')
      .set('content-type', 'application/json')
      .set('content-encoding', 'br-unknown')
      .send('{}')
      .expect(415);
    expect(response.body).toMatchObject({ status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
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
