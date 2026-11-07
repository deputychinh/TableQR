import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import request from 'supertest';
import type { TestApp } from './app.js';
import { ORIGIN, cookieOf } from './http.js';

const run = promisify(execFile);
const API_ROOT = new URL('../../', import.meta.url).pathname;
export const STAFF_PASSWORD = 'nhan-vien-mat-khau-1';
let counter = 0;

export type StaffRole = 'cashier' | 'waiter' | 'kitchen';

export const uniqueEmail = (prefix: string): string => {
  counter += 1;
  return `${prefix}${counter}-${Date.now()}@example.com`;
};

/** The owner adds a person through the API; returns the new staff member. */
export const addStaff = async (
  t: TestApp,
  ownerCookie: string,
  role: StaffRole,
  overrides: Record<string, unknown> = {},
) => {
  const body = {
    displayName: `Nhân viên ${role}`,
    email: uniqueEmail(role),
    password: STAFF_PASSWORD,
    role,
    ...overrides,
  };
  const response = await request(t.app.getHttpServer())
    .post('/api/staff')
    .set('origin', ORIGIN)
    .set('cookie', ownerCookie)
    .send(body)
    .expect(201);
  return { body, member: response.body as { id: string; email: string; role: string } };
};

export const login = (t: TestApp, email: string, password: string) =>
  request(t.app.getHttpServer())
    .post('/api/auth/login')
    .set('origin', ORIGIN)
    .send({ email, password });

/** Signs in and returns the session cookie (fails the test when sign-in fails). */
export const loginCookie = async (t: TestApp, email: string, password: string) =>
  cookieOf(await login(t, email, password).expect(200));

/** Runs the real CLI script (scripts/create-platform-admin.ts) against the test database. */
export const runCreatePlatformAdmin = (args: string[], env: Record<string, string> = {}) =>
  run(process.execPath, ['scripts/create-platform-admin.ts', ...args], {
    cwd: API_ROOT,
    env: { ...process.env, ...env },
  });

/** Creates a platform admin with the CLI and returns its session cookie. */
export const platformAdminCookie = async (t: TestApp) => {
  const email = uniqueEmail('admin');
  const password = 'quan-tri-mat-khau-1';
  await runCreatePlatformAdmin(['--email', email], { TQR_ADMIN_PASSWORD: password });
  return { email, password, cookie: await loginCookie(t, email, password) };
};
