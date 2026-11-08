import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const OWNER_PASSWORD = 'mat-khau-dai-123';
const WAITER_PASSWORD = 'phuc-vu-mat-khau-1';

// D5 ruling: floor staff may view and print table QR codes (they replace a torn sticker), and the
// navigation offers a waiter only the pages a waiter can open.
test('a waiter opens Bàn & QR from their home, sees only reachable pages and prints a code', async ({
  page,
}, info) => {
  const stamp = `${info.project.name}-${String(Date.now())}`;
  const waiterEmail = `phucvu-${stamp}@example.com`;

  // The owner signs up and, through the API with the same session, adds a table and a waiter.
  await page.goto('/dang-ky');
  await page.getByLabel('Tên nhà hàng').fill('Quán Phục Vụ E2E');
  await page.getByLabel('Email', { exact: true }).fill(`owner-floor-${stamp}@example.com`);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(OWNER_PASSWORD);
  await page.getByRole('button', { name: 'Tạo nhà hàng' }).click();
  await expect(page).toHaveURL(/\/quan-ly$/);
  expect(
    (await page.request.post('/api/tables', { data: { name: 'Bàn 7', seats: 4 } })).status(),
  ).toBe(201);
  expect(
    (
      await page.request.post('/api/staff', {
        data: {
          displayName: 'Chị Phục Vụ',
          email: waiterEmail,
          password: WAITER_PASSWORD,
          role: 'waiter',
        },
      })
    ).status(),
  ).toBe(201);
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(/\/dang-nhap$/);

  // The waiter signs in and lands on their home, which links to Bàn & QR.
  await page.getByLabel('Email', { exact: true }).fill(waiterEmail);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(WAITER_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).toHaveURL(/\/phuc-vu$/);
  await page.getByRole('link', { name: 'Bàn & QR' }).click();
  await expect(page).toHaveURL(/\/quan-ly\/ban$/);
  await expect(page.getByRole('heading', { name: 'Bàn 7' })).toBeVisible();

  // Navigation: their home and the pages open to floor staff — no owner-only sections.
  const nav = page.getByRole('navigation', { name: 'Quản lý nhà hàng' });
  await expect(nav.getByRole('link')).toHaveText(['Phục vụ', 'Bàn & QR', 'Đặt bàn']);
  await expect(page.getByRole('button', { name: 'Thêm bàn' })).toHaveCount(0);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
  ).toEqual([]);

  // The print sheet opens for them (no bounce back to /phuc-vu).
  await page.getByRole('button', { name: 'In mã QR của Bàn 7' }).click();
  await expect(page).toHaveURL(/\/quan-ly\/ban\/in\?ban=/);
  await expect(page.getByRole('img', { name: 'Mã QR của Bàn 7' })).toBeVisible();
});
