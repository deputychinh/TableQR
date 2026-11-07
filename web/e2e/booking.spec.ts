import process from 'node:process';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const expectNoSeriousA11yIssues = async (page: Page) => {
  // See tables.spec.ts: at the end of the page the bottom nav covers no control.
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

/** Tomorrow in Vietnam (YYYY-MM-DD), so every start time of the day is still in the future. */
const tomorrow = (): string => {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const day = new Date(`${today}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
};

const randomPhone = () => `09${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

const signUpWithTable = async (page: Page, label: string) => {
  await page.goto('/dang-ky');
  await page.getByLabel('Tên nhà hàng').fill(`Quán Đặt Bàn ${label}`);
  await page
    .getByLabel('Email', { exact: true })
    .fill(`booking-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('mat-khau-dai-123');
  await page.getByRole('button', { name: 'Tạo nhà hàng' }).click();
  await expect(page).toHaveURL(/\/quan-ly$/);
  await page.getByRole('link', { name: 'Bàn & QR' }).click();
  await page.getByRole('button', { name: 'Thêm bàn đầu tiên' }).click();
  const dialog = page.getByRole('dialog', { name: 'Thêm bàn' });
  await dialog.getByLabel('Tên bàn').fill('Bàn 1');
  await dialog.getByRole('button', { name: 'Thêm bàn' }).click();
  await expect(page.getByRole('status')).toContainText('Đã thêm Bàn 1');
};

const guestBooks = async (
  guest: Page,
  url: string,
  date: string,
  name: string,
  time: string | null = '19:00',
) => {
  await guest.goto(url);
  await expect(guest.getByRole('heading', { level: 1, name: /^Đặt bàn tại/u })).toBeVisible();
  await guest.getByLabel('Ngày').fill(date);
  await expect(guest.getByLabel('Giờ đến')).toBeVisible();
  if (time !== null) await guest.getByLabel('Giờ đến').selectOption(time);
  await guest.getByLabel('Họ và tên').fill(name);
  await guest.getByLabel('Số điện thoại').fill(randomPhone());
};

test('guest books online; staff confirms, then seats the party (AC48, AC51, AC52)', async ({
  page,
  browser,
}, info) => {
  await signUpWithTable(page, info.project.name);

  // The owner finds the public link on the booking page.
  await page.getByRole('link', { name: 'Đặt bàn' }).click();
  await expect(page).toHaveURL(/\/dat-ban$/);
  await expect(page.getByRole('heading', { name: 'Chưa có ai đặt bàn ngày này' })).toBeVisible();
  const url = await page.getByRole('textbox', { name: 'Đường dẫn đặt bàn' }).inputValue();
  expect(url).toMatch(/\/r\/[a-z0-9-]+\/dat-ban$/u);
  await expectNoSeriousA11yIssues(page);

  // A guest (no account, own browser) books tomorrow 19:00.
  const guestContext = await browser.newContext({ ...info.project.use });
  const guest = await guestContext.newPage();
  const date = tomorrow();
  await guestBooks(guest, url, date, 'Nguyễn Văn An');
  await expectNoSeriousA11yIssues(guest);
  await guest.getByRole('button', { name: 'Gửi yêu cầu đặt bàn' }).click();
  await expect(guest.getByRole('heading', { name: 'Đã gửi yêu cầu đặt bàn' })).toBeVisible();
  await expect(guest.getByText('Chờ duyệt')).toBeVisible();
  await expectNoSeriousA11yIssues(guest);

  // AC48: a second guest for the same slot is offered the nearest free times.
  await guest.getByRole('button', { name: 'Đặt thêm bàn khác' }).click();
  await guestBooks(guest, url, date, 'Trần Bình', null);
  await expect(guest.getByLabel('Giờ đến').locator('option[value="19:00"]')).toHaveCount(0);
  await guestContext.close();

  // Staff: tomorrow's list shows the booking "Chờ duyệt"; confirm it, then seat the party.
  await page.getByRole('button', { name: 'Ngày sau' }).click();
  const card = page.getByRole('article', { name: 'Nguyễn Văn An' });
  await expect(card.getByText('Chờ duyệt')).toBeVisible();
  await expect(card.getByText('Bàn: Bàn 1')).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  await card.getByRole('button', { name: 'Xác nhận' }).click();
  const sheet = page.getByRole('dialog', { name: 'Xác nhận đặt bàn của Nguyễn Văn An' });
  await expect(sheet.getByLabel('Bàn')).toHaveValue(/.+/u);
  await expectNoSeriousA11yIssues(page);
  await sheet.getByRole('button', { name: 'Xác nhận' }).click();
  await expect(page.getByRole('status')).toContainText('Đã xác nhận đặt bàn của Nguyễn Văn An');
  await expect(card.getByText('Đã xác nhận')).toBeVisible();

  await card.getByRole('button', { name: 'Nhận bàn' }).click();
  const confirm = page.getByRole('dialog', { name: 'Nhận bàn cho Nguyễn Văn An?' });
  await expect(confirm).toContainText('Mở phiên phục vụ tại Bàn 1 cho 2 khách');
  await confirm.getByRole('button', { name: 'Nhận bàn' }).click();
  await expect(page.getByRole('status')).toContainText('Đã nhận bàn cho Nguyễn Văn An tại Bàn 1');
  await expect(card.getByText('Đã nhận bàn')).toBeVisible();
  await expect(card.getByRole('button')).toHaveCount(0);
});

test('an unknown restaurant link says so', async ({ page }) => {
  await page.goto('/r/khong-co-quan-nay/dat-ban');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Không tìm thấy nhà hàng' }),
  ).toBeVisible();
  await expectNoSeriousA11yIssues(page);
});

// Evidence for review, not part of CI: E2E_SCREENSHOTS=1 npx playwright test booking --project=ipad
if (process.env.E2E_SCREENSHOTS) {
  test('screenshots of the booking screens', async ({ page, browser }) => {
    await signUpWithTable(page, 'shots');
    await page.goto('/dat-ban');
    const url = await page.getByRole('textbox', { name: 'Đường dẫn đặt bàn' }).inputValue();
    const date = tomorrow();
    const guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    await guestBooks(guest, url, date, 'Nguyễn Văn An');
    await guest.getByLabel('Ghi chú cho quán (không bắt buộc)').fill('Có trẻ nhỏ, cần ghế em bé');
    await guest.getByRole('button', { name: 'Gửi yêu cầu đặt bàn' }).click();
    await expect(guest.getByRole('heading', { name: 'Đã gửi yêu cầu đặt bàn' })).toBeVisible();
    await guestBooks(guest, url, date, 'Trần Bình', '12:00');
    await guest.getByRole('button', { name: 'Gửi yêu cầu đặt bàn' }).click();
    await expect(guest.getByRole('heading', { name: 'Đã gửi yêu cầu đặt bàn' })).toBeVisible();

    const dir = '../docs/delivery/001-qr-table-ordering/evidence';
    for (const [width, height] of [
      [390, 844],
      [1180, 820],
    ] as const) {
      for (const scheme of ['light', 'dark'] as const) {
        await guest.setViewportSize({ width, height });
        await guest.emulateMedia({ colorScheme: scheme });
        await guestBooks(guest, url, date, 'Lê Chi', null);
        await guest.screenshot({
          path: `${dir}/booking-guest-${width}-${scheme}.png`,
          fullPage: true,
        });
        await guest.getByLabel('Số điện thoại').fill('0212');
        await guest.getByRole('button', { name: 'Gửi yêu cầu đặt bàn' }).click();
        await expect(guest.getByText(/Nhập số di động Việt Nam 10 số/u)).toBeVisible();
        // The sticky bar would otherwise be captured mid-page where focus scrolled to.
        await guest.evaluate(() => {
          window.scrollTo(0, 0);
        });
        await guest.screenshot({
          path: `${dir}/booking-guest-errors-${width}-${scheme}.png`,
          fullPage: true,
        });

        await page.setViewportSize({ width, height });
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto('/dat-ban');
        await page.getByRole('button', { name: 'Ngày sau' }).click();
        await expect(page.getByRole('article', { name: 'Trần Bình' })).toBeVisible();
        await page.screenshot({
          path: `${dir}/booking-staff-${width}-${scheme}.png`,
          fullPage: true,
        });
        await page
          .getByRole('article', { name: 'Nguyễn Văn An' })
          .getByRole('button', { name: 'Xác nhận' })
          .click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.screenshot({ path: `${dir}/booking-confirm-${width}-${scheme}.png` });
        await page.keyboard.press('Escape');
      }
    }
    await guest.goto(url);
    await guestContext.close();
  });
}
