import request from 'supertest';
import type { TestApp } from './app.js';

export const ORIGIN = 'http://localhost:5310';
/** The password of every owner `newOwner()` / `signUp()` creates (step-up calls re-send it). */
export const OWNER_PASSWORD = 'mat-khau-dai-123';
let counter = 0;

/** A unique, valid sign-up body. */
export const newOwner = (name = 'Quán Thử') => {
  counter += 1;
  return {
    restaurantName: `${name} ${counter}`,
    email: `owner${counter}-${Date.now()}@example.com`,
    password: OWNER_PASSWORD,
  };
};

export const cookieOf = (response: request.Response): string => {
  const raw = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith('tqr_staff='));
  if (!cookie) throw new Error('no tqr_staff cookie');
  return cookie.split(';')[0] ?? '';
};

export const signUp = async (t: TestApp, body = newOwner()) => {
  const response = await request(t.app.getHttpServer())
    .post('/api/auth/signup')
    .set('origin', ORIGIN)
    .send(body)
    .expect(201);
  return { body, response, cookie: cookieOf(response) };
};
