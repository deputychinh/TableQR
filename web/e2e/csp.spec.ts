import { readFileSync } from 'node:fs';
// The plain Playwright `test` on purpose: this spec causes CSP violations to prove the policy holds,
// which the journeys' fixture (support/fixtures.ts) would rightly fail.
import { test, expect } from '@playwright/test';

const HEADERS = JSON.parse(
  readFileSync(new URL('../../deploy/security-headers.json', import.meta.url), 'utf8'),
) as Record<string, string>;

test('the preview serves the production header set on every SPA route (TQR-022)', async ({
  page,
}) => {
  for (const path of ['/', '/quan-ly/cai-dat', '/t/khong-co-ma']) {
    const response = await page.goto(path);
    const headers = response?.headers() ?? {};
    for (const [name, value] of Object.entries(HEADERS)) {
      expect(headers[name.toLowerCase()], `${path} ${name}`).toBe(value);
    }
    expect(headers['x-powered-by'], path).toBeUndefined();
  }
});

test('the CSP is enforced: an injected inline script or foreign image is refused', async ({
  page,
}) => {
  await page.goto('/');
  const violated = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        document.addEventListener('securitypolicyviolation', (event) =>
          resolve(event.effectiveDirective),
        );
        const script = document.createElement('script');
        script.textContent = 'window.__inline = true';
        document.body.append(script);
        const image = document.createElement('img');
        image.src = 'https://example.com/tracker.png';
        document.body.append(image);
      }),
  );
  expect(['script-src-elem', 'script-src', 'img-src']).toContain(violated);
  // The inline script never ran.
  expect(await page.evaluate(() => '__inline' in window)).toBe(false);
});
