import request from 'supertest';
import { createTestApp, type TestApp } from './support/app.js';

describe('GET /api/health (e2e, real Postgres)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('reports the API and the database as up under /api', async () => {
    const response = await request(t.app.getHttpServer()).get('/api/health').expect(200);
    expect(response.body).toEqual({ status: 'ok', db: 'up' });
  });

  it('no longer answers on the old unprefixed path', async () => {
    await request(t.app.getHttpServer()).get('/health').expect(404);
  });
});
