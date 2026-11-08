import { test as base, expect, type Page } from '@playwright/test';

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

/**
 * The journeys' `test`: on the iPhone project every screen a journey shows is watched (each
 * route change and every half second) and the test fails if any of them scrolled sideways.
 */
export const test = base.extend<{ noHorizontalScroll: undefined }>({
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
