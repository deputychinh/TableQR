import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

export { devices, expect } from '@playwright/test';
export type { APIRequestContext, Browser, Page, TestInfo } from '@playwright/test';

/**
 * Opens a shell destination the way a person would: from the bar or rail when it shows there,
 * otherwise from the "Thêm" sheet (phones keep at most five items in the bottom bar).
 */
export const openSection = async (page: Page, name: string): Promise<void> => {
  const nav = page.getByRole('navigation', { name: 'Điều hướng chính' });
  const link = nav.getByRole('link', { name, exact: true });
  if (await link.isVisible()) {
    await link.click();
    return;
  }
  await nav.getByRole('button', { name: 'Thêm' }).click();
  await page
    .getByRole('dialog', { name: 'Các trang khác' })
    .getByRole('link', { name, exact: true })
    .click();
};

interface Overflow {
  path: string;
  what: string;
  scrollWidth: number;
  width: number;
}

/**
 * Nothing may scroll sideways on a phone (r2 review: every owner page was 412 px wide at 390 px).
 * Runs in the page with the device's viewport width: the document (`scrollWidth <= innerWidth`,
 * and `innerWidth` itself, because a mobile browser widens its layout viewport to fit content that
 * overflows) and every `<main>` scroll area, which would hide a too-wide child.
 */
const measure = (viewport: number): Omit<Overflow, 'path'>[] => {
  const width = window.innerWidth;
  const found: Omit<Overflow, 'path'>[] = [];
  const root = document.documentElement;
  if (root.scrollWidth > width || width > viewport) {
    found.push({
      what: 'document',
      scrollWidth: Math.max(root.scrollWidth, width),
      width: viewport,
    });
  }
  for (const main of Array.from(document.querySelectorAll('main'))) {
    if (main.scrollWidth > main.clientWidth + 1) {
      found.push({ what: 'main', scrollWidth: main.scrollWidth, width: main.clientWidth });
    }
  }
  return found;
};

const viewportWidth = (page: Page): number =>
  page.viewportSize()?.width ?? Number.POSITIVE_INFINITY;

/** Asserts now, on the current screen, that the page does not scroll sideways. */
export const expectNoHorizontalScroll = async (page: Page): Promise<void> => {
  const found = await page.evaluate(measure, viewportWidth(page));
  expect(found, `horizontal scroll on ${new URL(page.url()).pathname}`).toEqual([]);
};

/** Prefix of the console line the page writes for each CSP violation (see `reportViolations`). */
const CSP_MARK = '[csp-violation]';

/** Runs in every page before its own scripts: a CSP violation becomes a console error. */
const reportViolations = (mark: string): void => {
  document.addEventListener('securitypolicyviolation', (event) => {
    console.error(`${mark} ${event.effectiveDirective} blocked ${event.blockedURI || 'inline'}`);
  });
};

/** A console message about a refused resource, from our listener or the browser itself. */
const isCspMessage = (text: string): boolean =>
  text.startsWith(CSP_MARK) || /Content[ -]Security[ -]Policy/i.test(text);

type ContextFactory = Browser['newContext'];

/**
 * The journeys' `test`: on the iPhone project every screen a journey shows is watched (each
 * route change and every half second) and the test fails if any of them scrolled sideways.
 * On both projects every page — the test's own and the guest phones a journey opens with
 * `browser.newContext()` / `browser.newPage()` — runs under the production CSP of `vite preview`
 * (TQR-022), and the test fails on any CSP violation.
 */
export const test = base.extend<{ noHorizontalScroll: undefined; noCspViolations: undefined }>({
  noCspViolations: [
    async ({ browser, context }, use) => {
      const violations: string[] = [];
      const watch = async (watched: BrowserContext) => {
        await watched.addInitScript(reportViolations, CSP_MARK);
        watched.on('console', (message) => {
          if (message.type() === 'error' && isCspMessage(message.text())) {
            violations.push(`${message.page()?.url() ?? '?'}: ${message.text()}`);
          }
        });
      };
      await watch(context);
      // `browser.newPage()` goes through `newContext()` too, so this covers both.
      const original: ContextFactory = browser.newContext.bind(browser);
      const patched: ContextFactory = async (options) => {
        const created = await original(options);
        await watch(created);
        return created;
      };
      browser.newContext = patched;
      try {
        await use(undefined);
      } finally {
        browser.newContext = original;
      }
      expect(violations, 'no Content-Security-Policy violations').toEqual([]);
    },
    { auto: true },
  ],
  noHorizontalScroll: [
    async ({ page }, use, info) => {
      if (info.project.name !== 'iphone') {
        await use(undefined);
        return;
      }
      const seen: Overflow[] = [];
      const check = async () => {
        // about:blank (before the first goto) has a 980 px layout and is not an app screen.
        if (page.isClosed() || !page.url().startsWith('http')) return;
        try {
          // Print emulation lays out an A4 sheet on purpose; only screen layouts must fit the phone.
          if (await page.evaluate(() => window.matchMedia('print').matches)) return;
          const path = new URL(page.url()).pathname;
          for (const found of await page.evaluate(measure, viewportWidth(page))) {
            if (!seen.some((s) => s.path === path && s.what === found.what)) {
              seen.push({ path, ...found });
            }
          }
        } catch {
          // The page navigated or closed between two checks; the next check measures again.
        }
      };
      const timer = setInterval(() => void check(), 500);
      page.on('framenavigated', () => void check());
      await use(undefined);
      clearInterval(timer);
      await check();
      expect(seen, 'no screen scrolls sideways at phone width').toEqual([]);
    },
    { auto: true },
  ],
});
