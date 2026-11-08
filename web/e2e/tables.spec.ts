import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const expectNoSeriousA11yIssues = async (page: Page) => {
  // axe's target-size rule counts a button scrolled under the sticky bottom nav as "obscured";
  // at the end of the page the nav sits in its own row and covers nothing, so check there.
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

const addTable = async (page: Page, name: string, extraSeats: number) => {
  const dialog = page.getByRole('dialog', { name: 'Thêm bàn' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Tên bàn').fill(name);
  for (let i = 0; i < extraSeats; i += 1) {
    await dialog.getByRole('button', { name: 'Thêm một chỗ' }).click();
  }
  await dialog.getByRole('button', { name: 'Thêm bàn' }).click();
  await expect(page.getByRole('status')).toContainText(`Đã thêm ${name}`);
};

test('owner adds tables, prints the QR sheet, regenerates a code and the old code expires', async ({
  page,
}, info) => {
  await page.goto('/dang-ky');
  await page.getByLabel('Tên nhà hàng').fill('Lẩu Nấm E2E');
  await page
    .getByLabel('Email', { exact: true })
    .fill(`tables-${info.project.name}-${Date.now()}@example.com`);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('mat-khau-dai-123');
  await page.getByRole('button', { name: 'Tạo nhà hàng' }).click();
  await expect(page).toHaveURL(/\/quan-ly$/);

  // Empty state → first table
  await page.getByRole('link', { name: 'Bàn & QR' }).click();
  await expect(page.getByRole('heading', { name: 'Chưa có bàn nào' })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await page.getByRole('button', { name: 'Thêm bàn đầu tiên' }).click();
  await expectNoSeriousA11yIssues(page);
  await addTable(page, 'Bàn 1', 0);
  await page.getByRole('button', { name: 'Thêm bàn', exact: true }).click();
  await addTable(page, 'Bàn 2', 2);

  // AC8: each table shows its own QR code that opens the guest page
  await expect(page.getByRole('img', { name: 'Mã QR của Bàn 1' })).toHaveAttribute(
    'src',
    /^data:image\/svg\+xml/,
  );
  await expect(page.getByRole('img', { name: 'Mã QR của Bàn 2' })).toHaveAttribute(
    'src',
    /^data:image\/svg\+xml/,
  );
  await expect(page.getByText('6 chỗ ngồi')).toBeVisible();
  const oldUrl = await page
    .getByRole('link', { name: 'Xem trang khách của Bàn 1' })
    .getAttribute('href');
  expect(oldUrl).toMatch(/\/t\/[A-Za-z0-9_-]{22}$/);
  await expectNoSeriousA11yIssues(page);

  // AC9: the print sheet has one card per table with QR, names and the scan line
  await page.getByRole('button', { name: 'In tất cả mã QR' }).click();
  await expect(page).toHaveURL(/\/quan-ly\/ban\/in$/);
  const sheet = page.getByRole('region', { name: 'Trang in mã QR' });
  await expect(sheet.getByRole('article')).toHaveCount(2);
  await expect(sheet.getByText('Lẩu Nấm E2E')).toHaveCount(2);
  await expect(sheet.getByText('Quét mã để gọi món')).toHaveCount(2);
  await expectNoSeriousA11yIssues(page);
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('button', { name: 'In ngay' })).toBeHidden();
  await expect(page.getByRole('link', { name: 'Quay lại danh sách bàn' })).toBeHidden();
  await expect(sheet.getByRole('article').first()).toHaveCSS('break-inside', 'avoid');
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('link', { name: 'Quay lại danh sách bàn' }).click();

  // The guest page before rotation
  const guest = await page.context().newPage();
  await guest.goto(oldUrl ?? '');
  await expect(guest.getByRole('heading', { name: 'Chào mừng bạn đến Lẩu Nấm E2E' })).toBeVisible();
  await expect(guest.getByRole('button', { name: 'Bắt đầu gọi món' })).toBeVisible();
  await expectNoSeriousA11yIssues(guest);

  // AC10: regenerate → the old code shows "Mã QR đã hết hạn", the new one works
  await page.getByRole('button', { name: 'Đổi mã QR của Bàn 1' }).click();
  await expectNoSeriousA11yIssues(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Đổi mã QR' }).click();
  await expect(page.getByRole('status')).toContainText('Đã đổi mã QR của Bàn 1');
  const qrLink = page.getByRole('link', { name: 'Xem trang khách của Bàn 1' });
  await expect(qrLink).not.toHaveAttribute('href', oldUrl ?? '');
  const newUrl = await qrLink.getAttribute('href');

  await guest.reload();
  await expect(guest.getByRole('heading', { level: 1, name: 'Mã QR đã hết hạn' })).toBeVisible();
  await expectNoSeriousA11yIssues(guest);
  await guest.goto(newUrl ?? '');
  await expect(guest.getByRole('button', { name: 'Bắt đầu gọi món' })).toBeVisible();

  // AC11: an unknown code
  await guest.goto('/t/AAAAAAAAAAAAAAAAAAAAAA');
  await expect(guest.getByRole('heading', { level: 1, name: 'Không tìm thấy bàn' })).toBeVisible();
  await expectNoSeriousA11yIssues(guest);
});
