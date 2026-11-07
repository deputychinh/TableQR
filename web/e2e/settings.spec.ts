import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const expectNoSeriousA11yIssues = async (page: Page) => {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
  ).toEqual([]);
};

test('owner sets house rules and a bank account; a reload shows them (AC12 settings)', async ({
  page,
}, info) => {
  await page.goto('/dang-ky');
  await page.getByLabel('Tên nhà hàng').fill('Phở Cài Đặt');
  await page
    .getByLabel('Email', { exact: true })
    .fill(`settings-${info.project.name}-${Date.now()}@example.com`);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('mat-khau-dai-123');
  await page.getByRole('button', { name: 'Tạo nhà hàng' }).click();
  await expect(page).toHaveURL(/\/quan-ly$/);

  await page.getByRole('link', { name: /Chọn cách vận hành/ }).click();
  await expect(page).toHaveURL(/\/quan-ly\/cai-dat$/);
  await expect(page.getByRole('heading', { name: 'Cài đặt quán', level: 1 })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Ăn xong mới thanh toán/ })).toBeChecked();
  await expectNoSeriousA11yIssues(page);

  await page.getByText('Thanh toán trước khi bếp làm', { exact: true }).click();
  await page.getByText('Duyệt mọi đơn', { exact: true }).click();
  await page.getByLabel('Ngân hàng').selectOption({ label: 'Vietcombank' });
  await page.getByLabel('Số tài khoản').fill('0123 456 789');
  await page.getByLabel('Tên chủ tài khoản').fill('Nguyễn Văn Ánh');
  await expect(page.getByTestId('bank-preview')).toContainText('NGUYEN VAN ANH');
  await expect(page.getByText('Bạn có thay đổi chưa lưu')).toBeVisible();
  await expectNoSeriousA11yIssues(page);

  await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
  const sheet = page.getByRole('dialog', { name: 'Đổi tài khoản nhận tiền?' });
  await expect(sheet).toContainText('0123456789');
  await expectNoSeriousA11yIssues(page);
  await sheet.getByRole('button', { name: 'Đúng, lưu tài khoản này' }).click();
  await expect(page.getByText(/Đã lưu/)).toBeVisible();

  await page.reload();
  await expect(page.getByRole('radio', { name: /Thanh toán trước khi bếp làm/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: /Duyệt mọi đơn/ })).toBeChecked();
  await expect(page.getByLabel('Số tài khoản')).toHaveValue('0123456789');
  await expect(page.getByLabel('Tên chủ tài khoản')).toHaveValue('NGUYEN VAN ANH');
  await expect(page.getByText(/Tài khoản đổi lần cuối lúc/)).toBeVisible();
});

test('leaving with unsaved changes asks first', async ({ page }, info) => {
  await page.goto('/dang-ky');
  await page.getByLabel('Tên nhà hàng').fill('Quán Chưa Lưu');
  await page
    .getByLabel('Email', { exact: true })
    .fill(`unsaved-${info.project.name}-${Date.now()}@example.com`);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('mat-khau-dai-123');
  await page.getByRole('button', { name: 'Tạo nhà hàng' }).click();
  await expect(page).toHaveURL(/\/quan-ly$/);
  await page.goto('/quan-ly/cai-dat');
  await page.getByText('Nhân viên mở bàn', { exact: true }).click();
  await page.getByRole('link', { name: 'Tổng quan' }).click();
  const sheet = page.getByRole('dialog', { name: 'Rời trang khi chưa lưu?' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Ở lại' }).click();
  await expect(page).toHaveURL(/\/quan-ly\/cai-dat$/);
  await expect(page.getByRole('radio', { name: /Nhân viên mở bàn/ })).toBeChecked();
});
