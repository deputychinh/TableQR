import process from 'node:process';
import {
  test,
  expect,
  type APIRequestContext,
  type Browser,
  type Page,
} from './support/fixtures.js';
import AxeBuilder from '@axe-core/playwright';

const expectNoSeriousA11yIssues = async (page: Page) => {
  // A button under the fixed bottom bar counts as "obscured" for axe; check at the end of the page.
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
  ).toEqual([]);
};

const signUp = async (page: Page, label: string) => {
  await page.goto('/dang-ky');
  await page.getByLabel('Tên nhà hàng').fill('Quán Gọi Món E2E');
  await page
    .getByLabel('Email', { exact: true })
    .fill(`order-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('mat-khau-dai-123');
  await page.getByRole('button', { name: 'Tạo nhà hàng' }).click();
  await expect(page).toHaveURL(/\/quan-ly$/);
};

/** Menu (two main dishes, a drink) and one table through the owner's API session. */
const setUpRestaurant = async (api: APIRequestContext): Promise<string> => {
  const json = async (method: 'get' | 'post', path: string, data?: object) => {
    const response = await api[method](path, data ? { data } : undefined);
    expect(response.ok()).toBe(true);
    return (await response.json()) as Record<string, unknown>;
  };
  const menu = (await json('get', '/api/menu')) as { stations: { id: string }[] };
  const stationId = menu.stations[0]?.id;
  const main = await json('post', '/api/menu/categories', { name: 'Món chính', isMain: true });
  const drinks = await json('post', '/api/menu/categories', { name: 'Đồ uống', isMain: false });
  for (const [name, priceVnd, categoryId] of [
    ['Phở bò tái', 45000, main.id],
    ['Cơm tấm sườn', 40000, main.id],
    ['Trà đá', 5000, drinks.id],
  ] as const) {
    await json('post', '/api/menu/items', { name, priceVnd, categoryId, stationId });
  }
  const table = await json('post', '/api/tables', { name: 'Bàn 1', seats: 4 });
  return table.qrToken as string;
};

/** A guest phone: its own browser context, so its own cookie (never the owner's). */
const guestPhone = async (browser: Browser, page: Page) => {
  const context = await browser.newContext({
    viewport: page.viewportSize(),
    userAgent: await page.evaluate(() => navigator.userAgent),
    hasTouch: true,
    isMobile: (page.viewportSize()?.width ?? 1000) < 600,
    baseURL: new URL(page.url()).origin,
  });
  return context.newPage();
};

test('guest checks in, orders 3 main dishes for 1, waits for the waiter, then sees "Đang chờ" live', async ({
  page,
  browser,
}, info) => {
  await signUp(page, info.project.name);
  const qrToken = await setUpRestaurant(page.request);

  // S6: the guest scans and says how many they are (AC17)
  const guest = await guestPhone(browser, page);
  await guest.goto(`/t/${qrToken}`);
  await expect(
    guest.getByRole('heading', { level: 1, name: 'Chào mừng bạn đến Quán Gọi Món E2E' }),
  ).toBeVisible();
  await expectNoSeriousA11yIssues(guest);
  await guest.getByRole('button', { name: 'Bớt một người' }).click();
  await expect(guest.getByRole('spinbutton', { name: 'Bàn mình có mấy người?' })).toHaveValue('1');
  await guest.getByRole('button', { name: 'Bắt đầu gọi món' }).click();

  // S7: three main dishes for one person (AC22)
  await expect(guest.getByRole('heading', { level: 1, name: 'Thực đơn' })).toBeVisible();
  await guest.getByRole('button', { name: 'Thêm một Phở bò tái' }).click();
  await guest.getByRole('button', { name: 'Thêm một Phở bò tái' }).click();
  await guest.getByRole('button', { name: 'Thêm một Cơm tấm sườn' }).click();
  await expect(guest.getByRole('button', { name: 'Giỏ hàng (3)' })).toBeVisible();
  await expect(guest.getByText(/130\.000\s₫/u)).toBeVisible();
  await expectNoSeriousA11yIssues(guest);
  await guest.getByRole('button', { name: 'Giỏ hàng (3)' }).click();
  const cart = guest.getByRole('dialog', { name: 'Giỏ hàng' });
  await cart.getByLabel('Ghi chú cho Phở bò tái (không bắt buộc)').fill('ít hành');
  await expectNoSeriousA11yIssues(guest);
  await cart.getByRole('button', { name: 'Gửi món' }).click();

  // S8: held as "Chờ xác nhận" with the reason (AC26)
  await expect(guest.getByRole('heading', { level: 1, name: 'Món đã gọi' })).toBeVisible();
  await expect(guest.getByText('Đã gửi món. Bạn theo dõi từng món ở đây.')).toBeVisible();
  await expect(guest.getByText(/nhiều hơn thường lệ cho 1 người/)).toBeVisible();
  await expect(guest.getByText('Chờ xác nhận', { exact: true })).toHaveCount(3);
  await expect(guest.getByText('Đang cập nhật trực tiếp')).toBeVisible();
  await expectNoSeriousA11yIssues(guest);

  // The waiter (here the owner) confirms on /phuc-vu/duyet (AC28)
  await page.goto('/phuc-vu/duyet');
  const card = page.getByRole('article').filter({ hasText: 'Bàn 1' });
  await expect(card.getByText('Nhiều món chính hơn thường lệ cho 1 người')).toBeVisible();
  await expect(card.getByText('3 phần món chính')).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await card.getByRole('button', { name: 'Xác nhận đơn của Bàn 1' }).click();
  await expect(page.getByText('Đã xác nhận đơn của Bàn 1. Món đã vào bếp.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Không có đơn nào cần duyệt' })).toBeVisible();

  // S11: the guest sees "Đang chờ" without reloading (AC38)
  await expect(guest.getByText('Đang chờ', { exact: true })).toHaveCount(2, { timeout: 5000 });
  await expect(guest.getByText('Chờ xác nhận', { exact: true })).toHaveCount(0);

  // AC18: a second phone joins the same table without being asked, and sees the order
  const second = await guestPhone(browser, page);
  await second.goto(`/t/${qrToken}?xem=da-goi`);
  await expect(second.getByRole('heading', { level: 1, name: 'Món đã gọi' })).toBeVisible();
  await expect(second.getByText('Đang chờ', { exact: true })).toHaveCount(2);
  await guest.context().close();
  await second.context().close();
});

test('with "staff opens" the guest is asked to wait and cannot order', async ({
  page,
  browser,
}, info) => {
  await signUp(page, `wait-${info.project.name}`);
  const qrToken = await setUpRestaurant(page.request);
  const rules = (await (await page.request.get('/api/restaurant/settings')).json()) as {
    rules: Record<string, unknown>;
  };
  const saved = await page.request.put('/api/restaurant/settings', {
    data: { rules: { ...rules.rules, sessionOpening: 'staff_opens' }, bank: null },
  });
  expect(saved.ok()).toBe(true);
  const guest = await guestPhone(browser, page);
  await guest.goto(`/t/${qrToken}`);
  await expect(
    guest.getByRole('heading', { level: 1, name: 'Vui lòng chờ nhân viên mở bàn' }),
  ).toBeVisible();
  await expect(guest.getByRole('button', { name: /Thêm một/ })).toHaveCount(0);
  await expectNoSeriousA11yIssues(guest);
  await guest.context().close();
});

// Evidence for review, not part of CI: E2E_SCREENSHOTS=1 npx playwright test ordering --project=ipad
if (process.env.E2E_SCREENSHOTS) {
  test('screenshots of the ordering screens', async ({ page, browser }) => {
    test.setTimeout(120_000);
    await signUp(page, 'shots');
    const qrToken = await setUpRestaurant(page.request);
    const dir = '../docs/delivery/001-qr-table-ordering/evidence';
    const guest = await guestPhone(browser, page);
    await guest.goto(`/t/${qrToken}`);
    await expect(guest.getByRole('button', { name: 'Bắt đầu gọi món' })).toBeVisible();
    const shots: [string, Page][] = [];
    /** WebKit keeps inherited colours when the scheme changes in place, so reload per scheme. */
    const snap = async (
      name: string,
      target: Page,
      options: { fullPage?: boolean; prepare?: () => Promise<void> } = {},
    ) => {
      for (const width of [390, 1180]) {
        for (const scheme of ['light', 'dark'] as const) {
          await target.setViewportSize({ width, height: width === 390 ? 844 : 820 });
          await target.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
          await target.reload();
          await options.prepare?.();
          await target.screenshot({
            path: `${dir}/ordering-${name}-${width}-${scheme}.png`,
            fullPage: options.fullPage ?? false,
          });
        }
      }
      shots.push([name, target]);
    };
    await snap('check-in', guest, {
      prepare: () => expect(guest.getByRole('button', { name: 'Bắt đầu gọi món' })).toBeVisible(),
    });
    await guest.getByRole('button', { name: 'Bớt một người' }).click();
    await guest.getByRole('button', { name: 'Bắt đầu gọi món' }).click();
    await guest.getByRole('button', { name: 'Thêm một Phở bò tái' }).click();
    await guest.getByRole('button', { name: 'Thêm một Phở bò tái' }).click();
    await guest.getByRole('button', { name: 'Thêm một Cơm tấm sườn' }).click();
    await guest.getByRole('button', { name: 'Giỏ hàng (3)' }).click();
    await guest.getByLabel('Ghi chú cho Phở bò tái (không bắt buộc)').fill('ít hành');
    await guest.keyboard.press('Escape');
    await snap('menu', guest, {
      prepare: () => expect(guest.getByRole('button', { name: 'Giỏ hàng (3)' })).toBeVisible(),
    });
    await snap('cart', guest, {
      prepare: async () => {
        await guest.getByRole('button', { name: 'Giỏ hàng (3)' }).click();
        await expect(guest.getByRole('dialog', { name: 'Giỏ hàng' })).toBeVisible();
      },
    });
    await guest.getByRole('dialog').getByRole('button', { name: 'Gửi món' }).click();
    const held = () => expect(guest.getByText('Chờ xác nhận', { exact: true })).toHaveCount(3);
    await held();
    await snap('orders-held', guest, { fullPage: true, prepare: held });
    await page.goto('/phuc-vu/duyet');
    const listed = () => expect(page.getByRole('article')).toHaveCount(1);
    await snap('review', page, { fullPage: true, prepare: listed });
    await snap('review-reject', page, {
      prepare: async () => {
        await listed();
        await page.getByRole('button', { name: 'Từ chối đơn của Bàn 1' }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
      },
    });
    await page.getByRole('button', { name: 'Quay lại' }).click();
    await page.getByRole('button', { name: 'Xác nhận đơn của Bàn 1' }).click();
    await expect(guest.getByText('Đang chờ', { exact: true })).toHaveCount(2);
    await snap('orders-live', guest, {
      fullPage: true,
      prepare: () => expect(guest.getByText('Đang chờ', { exact: true })).toHaveCount(2),
    });
    expect(shots).toHaveLength(7);
  });
}
