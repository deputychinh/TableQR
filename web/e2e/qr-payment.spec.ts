import process from 'node:process';
import {
  test,
  expect,
  type APIRequestContext,
  type Browser,
  type Page,
} from './support/fixtures.js';
import AxeBuilder from '@axe-core/playwright';

/** TQR-029: QR payment is a per-restaurant option, off by default. */

const PASSWORD = 'mat-khau-dai-123';
const EVIDENCE = '../docs/delivery/001-qr-table-ordering/evidence';

const expectNoSeriousA11yIssues = async (page: Page) => {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
  ).toEqual([]);
};

const signUp = async (page: Page, name: string, label: string) => {
  await page.goto('/dang-ky');
  await page.getByLabel('Tên nhà hàng').fill(name);
  await page
    .getByLabel('Email', { exact: true })
    .fill(`qr-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Tạo nhà hàng' }).click();
  await expect(page).toHaveURL(/\/quan-ly$/);
};

/** A dish and a table through the owner's API session; returns the table's QR token. */
const setUpMenuAndTable = async (api: APIRequestContext): Promise<string> => {
  const json = async (method: 'get' | 'post', path: string, data?: object) => {
    const response = await api[method](path, data ? { data } : undefined);
    expect(response.ok()).toBe(true);
    return (await response.json()) as Record<string, unknown>;
  };
  const menu = (await json('get', '/api/menu')) as { stations: { id: string }[] };
  const main = await json('post', '/api/menu/categories', { name: 'Món chính', isMain: true });
  await json('post', '/api/menu/items', {
    name: 'Phở bò tái',
    priceVnd: 45000,
    categoryId: main.id,
    stationId: menu.stations[0]?.id,
  });
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

test('a fresh restaurant (QR off): order, bill "Thanh toán tại quầy", cashier "Đã nhận tiền"', async ({
  page,
  browser,
}, info) => {
  await signUp(page, 'Quán Tại Quầy', info.project.name);
  // Onboarding does not push a bank account: step 3 is choosing how the restaurant runs.
  await expect(page.getByRole('link', { name: /Chọn cách vận hành/ })).toContainText('tuỳ chọn');
  const qrToken = await setUpMenuAndTable(page.request);

  const guest = await guestPhone(browser, page);
  await guest.goto(`/t/${qrToken}`);
  await guest.getByRole('button', { name: 'Bắt đầu gọi món' }).click();
  await guest.getByRole('button', { name: 'Thêm một Phở bò tái' }).click();
  await guest.getByRole('button', { name: 'Giỏ hàng (1)' }).click();
  await guest
    .getByRole('dialog', { name: 'Giỏ hàng' })
    .getByRole('button', { name: 'Gửi món' })
    .click();
  await expect(guest.getByRole('heading', { level: 1, name: 'Món đã gọi' })).toBeVisible();

  // The bill entry on the ordering page still works; the bill has no VietQR.
  await guest.getByRole('button', { name: 'Xem hoá đơn / Thanh toán' }).click();
  await expect(guest).toHaveURL(new RegExp(`/t/${qrToken}/hoa-don$`));
  await expect(guest.getByRole('heading', { name: 'Thanh toán tại quầy' })).toBeVisible();
  await expect(guest.getByText('Phở bò tái')).toBeVisible();
  const code = (await guest.locator('.guest-bill__code strong').textContent()) ?? '';
  expect(code).toMatch(/^[0-9A-Z]{5}$/);
  await expect(guest.getByRole('img', { name: /Mã VietQR/ })).toHaveCount(0);
  await expect(guest.getByText(/chuyển khoản|mã QR/i)).toHaveCount(0);
  await expectNoSeriousA11yIssues(guest);

  // The owner takes the money at the counter: one action, no transfer button.
  await page.goto('/thu-ngan');
  await expect(page.getByRole('heading', { name: 'Bàn 1' })).toBeVisible();
  await expect(page.getByText(`Mã ${code}`)).toBeVisible();
  await expect(page.getByRole('button', { name: /Đã nhận chuyển khoản/ })).toHaveCount(0);
  await expectNoSeriousA11yIssues(page);
  await page.getByRole('button', { name: 'Đã nhận tiền – Bàn 1', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Xác nhận đã nhận tiền?' });
  await expect(sheet).toContainText(`mã hoá đơn ${code}`);
  await sheet.getByRole('button', { name: /Đã nhận 45\.000/ }).click();
  await expect(page.getByRole('status')).toContainText('Đã ghi nhận');

  await expect(guest.getByRole('heading', { name: 'Đã thanh toán' })).toBeVisible();
  await guest.context().close();
});

test('settings: turning QR on asks for the account; saved with the account, bills get the QR', async ({
  page,
}, info) => {
  await signUp(page, 'Quán Bật QR', info.project.name);
  await page.goto('/quan-ly/cai-dat');
  const qr = page.getByRole('switch', { name: 'Cho khách chuyển khoản bằng mã QR' });
  await expect(qr).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByLabel('Ngân hàng')).toHaveCount(0);
  await qr.click();
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(
    page.getByText('Nhập tài khoản nhận tiền để bật chuyển khoản bằng mã QR.'),
  ).toBeVisible();
  await expect(page.getByLabel('Ngân hàng')).toBeFocused();
  await expectNoSeriousA11yIssues(page);

  await page.getByLabel('Ngân hàng').selectOption({ label: 'Vietcombank' });
  await page.getByLabel('Số tài khoản').fill('0123456789');
  await page.getByLabel('Tên chủ tài khoản').fill('Nguyễn Văn Ánh');
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
  const sheet = page.getByRole('dialog', { name: 'Đổi tài khoản nhận tiền?' });
  await sheet.getByLabel('Mật khẩu đăng nhập của bạn', { exact: true }).fill(PASSWORD);
  await sheet.getByRole('button', { name: 'Đúng, lưu tài khoản này' }).click();
  await expect(page.getByText(/Đã lưu/)).toBeVisible();
  await page.reload();
  await expect(qr).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByLabel('Số tài khoản')).toHaveValue('0123456789');
  const rules = (await (await page.request.get('/api/restaurant/rules')).json()) as {
    qrEnabled: boolean;
  };
  expect(rules.qrEnabled).toBe(true);
});

// Evidence for review, not part of CI: E2E_SCREENSHOTS=1 npx playwright test qr-payment --project=iphone
// Writes qr-off-guest-bill-390-<scheme>.png and settings-qr-toggle-390-<scheme>.png (TQR-029).
if (process.env.E2E_SCREENSHOTS) {
  test('screenshots: guest bill with QR off, settings toggle', async ({ page, browser }, info) => {
    await signUp(page, 'Quán Tại Quầy', `shots-${info.project.name}`);
    const qrToken = await setUpMenuAndTable(page.request);
    const guest = await guestPhone(browser, page);
    await guest.goto(`/t/${qrToken}`);
    await guest.getByRole('button', { name: 'Bắt đầu gọi món' }).click();
    await guest.getByRole('button', { name: 'Thêm một Phở bò tái' }).click();
    await guest.getByRole('button', { name: 'Giỏ hàng (1)' }).click();
    await guest
      .getByRole('dialog', { name: 'Giỏ hàng' })
      .getByRole('button', { name: 'Gửi món' })
      .click();
    await expect(guest.getByRole('heading', { level: 1, name: 'Món đã gọi' })).toBeVisible();
    for (const scheme of ['light', 'dark'] as const) {
      for (const p of [guest, page]) {
        await p.setViewportSize({ width: 390, height: 844 });
        await p.emulateMedia({ colorScheme: scheme });
      }
      await guest.goto(`/t/${qrToken}/hoa-don`);
      await expect(guest.getByRole('heading', { name: 'Thanh toán tại quầy' })).toBeVisible();
      await guest.screenshot({
        path: `${EVIDENCE}/qr-off-guest-bill-390-${scheme}.png`,
        fullPage: true,
      });
      await page.goto('/quan-ly/cai-dat');
      const qr = page.getByRole('switch', { name: 'Cho khách chuyển khoản bằng mã QR' });
      await qr.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${EVIDENCE}/settings-qr-toggle-390-${scheme}.png` });
      await qr.click();
      await page.getByLabel('Ngân hàng').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${EVIDENCE}/settings-qr-on-390-${scheme}.png` });
      await qr.click();
    }
    await guest.context().close();
  });
}
