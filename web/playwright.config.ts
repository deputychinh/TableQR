import process from 'node:process';
import { defineConfig, devices } from '@playwright/test';

const PREVIEW_URL = 'http://localhost:4310';
const STUB_API_PORT = '3399';

/** Journeys run against the production build (vite preview), on the two devices the product targets. */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: PREVIEW_URL, trace: 'on-first-retry' },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 13'] } },
    { name: 'ipad', use: { ...devices['iPad (gen 7)'] } },
  ],
  webServer: [
    {
      // Stub API behind the preview proxy, so e2e proves the same-origin /api path (ADR 0002).
      command: `node e2e/stub-api.mjs`,
      url: `http://127.0.0.1:${STUB_API_PORT}/api/health`,
      env: { STUB_API_PORT },
      reuseExistingServer: false,
    },
    {
      command: 'npm run build-only && npm run preview -- --port 4310 --strictPort',
      url: PREVIEW_URL,
      env: { TQR_API_PORT: STUB_API_PORT },
      reuseExistingServer: false,
    },
  ],
});
