import process from 'node:process';
import { defineConfig, devices } from '@playwright/test';

// Ports are configurable so several worktrees can run e2e at once.
const PREVIEW_PORT = process.env.E2E_PREVIEW_PORT ?? '4310';
const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}`;
const E2E_API_PORT = process.env.E2E_API_PORT ?? '3399';

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
      // The real API (built) on its own port against the local Postgres, behind the preview proxy.
      command: 'cd ../services/api && npm run build && node dist/main.js',
      url: `http://127.0.0.1:${E2E_API_PORT}/api/health`,
      env: {
        PORT: E2E_API_PORT,
        TQR_DATABASE_URL:
          process.env.TQR_DATABASE_URL ?? 'postgresql://tableqr:tableqr@127.0.0.1:55432/tableqr',
        TQR_SESSION_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e',
        TQR_WEB_ORIGINS: PREVIEW_URL,
        // Every journey signs in from the preview proxy's address.
        TQR_AUTH_RATE_LIMIT_PER_MINUTE: '100000',
        // Every guest journey checks in, orders and books from the same address.
        TQR_GUEST_CHECKINS_PER_MINUTE: '100000',
        TQR_GUEST_ORDERS_PER_10_MINUTES: '100000',
        TQR_GUEST_BILL_REQUESTS_PER_MINUTE: '100000',
        TQR_BOOKINGS_PER_HOUR: '100000',
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npm run build-only && npm run preview -- --port ${PREVIEW_PORT} --strictPort`,
      url: PREVIEW_URL,
      env: { TQR_API_PORT: E2E_API_PORT },
      reuseExistingServer: false,
    },
  ],
});
