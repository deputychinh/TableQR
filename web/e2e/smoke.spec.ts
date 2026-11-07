import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const expectNoSeriousA11yIssues = async (page: import('@playwright/test').Page) => {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
  ).toEqual([]);
};

test('landing page offers sign-up and reaches the API on the same origin', async ({ page }) => {
  const health = await page.request.get('/api/health');
  expect(health.ok()).toBe(true);
  expect(health.headers()['x-request-id']).toBeTruthy();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('quét mã QR');
  await expect(page.getByRole('link', { name: 'Đăng ký nhà hàng' })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
});

test('owner signs up, lands on the overview, signs out and signs back in', async ({
  page,
}, info) => {
  const email = `e2e-${info.project.name}-${Date.now()}@example.com`;
  await page.goto('/dang-ky');
  await expectNoSeriousA11yIssues(page);
  await page.getByLabel('Tên nhà hàng').fill('Bún Chả E2E');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('mat-khau-dai-123');
  await page.getByRole('button', { name: 'Tạo nhà hàng' }).click();
  await expect(page).toHaveURL(/\/quan-ly$/);
  await expect(page.getByRole('heading', { name: 'Chào mừng đến Bún Chả E2E' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Thêm bàn và in mã QR/ })).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(/\/dang-nhap$/);
  await page.goto('/quan-ly');
  await expect(page).toHaveURL(/\/dang-nhap\?next=/);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('mat-khau-dai-123');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).toHaveURL(/\/quan-ly$/);
});

test('sign-up shows field errors and keeps focus on the first invalid field', async ({ page }) => {
  await page.goto('/dang-ky');
  await page.getByLabel('Tên nhà hàng').fill('A');
  await page.getByLabel('Email', { exact: true }).fill('khong-phai-email');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('ngan');
  await page.getByRole('button', { name: 'Tạo nhà hàng' }).click();
  await expect(page.getByText('Tên nhà hàng cần từ 2 đến 80 ký tự.')).toBeVisible();
  await expect(page.getByText('Email chưa đúng định dạng.')).toBeVisible();
  await expect(page.getByText('Mật khẩu cần ít nhất 10 ký tự.')).toBeVisible();
  await expect(page.getByLabel('Tên nhà hàng')).toBeFocused();
  await expectNoSeriousA11yIssues(page);
});

test('wrong password shows one friendly message', async ({ page }) => {
  await page.goto('/dang-nhap');
  await page.getByLabel('Email', { exact: true }).fill(`nobody-${Date.now()}@example.com`);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('sai-mat-khau-123');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('alert')).toContainText('Email hoặc mật khẩu không đúng.');
});
