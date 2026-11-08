import process from 'node:process';
import { test, expect, type Page } from './support/fixtures.js';
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
  // Step-up (TQR-023): the sheet starts in the password field; a wrong one is said inline.
  const password = sheet.getByLabel('Mật khẩu đăng nhập của bạn', { exact: true });
  await expect(password).toBeFocused();
  await expect(password).toHaveAttribute('type', 'password');
  await expect(password).toHaveAttribute('autocomplete', 'current-password');
  await expectNoSeriousA11yIssues(page);
  await password.fill('mat-khau-sai-1');
  await sheet.getByRole('button', { name: 'Đúng, lưu tài khoản này' }).click();
  await expect(sheet.getByText('Mật khẩu không đúng. Kiểm tra lại rồi thử lần nữa.')).toBeVisible();
  await expect(password).toHaveValue('');
  await expect(password).toBeFocused();
  await expectNoSeriousA11yIssues(page);
  await password.fill('mat-khau-dai-123');
  await password.press('Enter');
  await expect(page.getByText(/Đã lưu/)).toBeVisible();
  await expect(sheet).toBeHidden();

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
  await sheet.getByRole('button', { name: 'Huỷ' }).click();
  await expect(page).toHaveURL(/\/quan-ly\/cai-dat$/);
  await expect(page.getByRole('radio', { name: /Nhân viên mở bàn/ })).toBeChecked();
});

test('the field to fix is focused in view, never under the sticky save bar (r2 review)', async ({
  page,
}, info) => {
  await page.goto('/dang-ky');
  await page.getByLabel('Tên nhà hàng').fill('Nhà hàng Lẩu Nấm Ashima Phố Cổ Hà Nội Chi Nhánh Một');
  await page
    .getByLabel('Email', { exact: true })
    .fill(`invalid-${info.project.name}-${Date.now()}@example.com`);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('mat-khau-dai-123');
  await page.getByRole('button', { name: 'Tạo nhà hàng' }).click();
  await expect(page).toHaveURL(/\/quan-ly$/);
  await page.goto('/quan-ly/cai-dat');
  await page.getByLabel('Ngân hàng').selectOption({ label: 'Vietcombank' });
  await page.getByLabel('Số tài khoản').fill('123');
  await page.getByLabel('Tên chủ tài khoản').fill('Nguyễn Văn Ánh');
  // Back to the top, so saving has to bring the wrong field into view.
  await page.locator('main').evaluate((main) => main.scrollTo(0, 0));
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click();

  const field = page.getByLabel('Số tài khoản');
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  // Fully between the header and the save bar (polled until the scroll settles).
  await expect
    .poll(async () => {
      const [box, bar, header] = await Promise.all([
        field.boundingBox(),
        page.locator('.settings-page__bar').boundingBox(),
        page.locator('header').first().boundingBox(),
      ]);
      return (
        box !== null &&
        bar !== null &&
        header !== null &&
        box.y >= header.y + header.height &&
        box.y + box.height <= bar.y
      );
    })
    .toBe(true);
});

// Evidence for review, not part of CI: E2E_SCREENSHOTS=1 npx playwright test settings --project=iphone
// Writes docs/delivery/001-qr-table-ordering/evidence/settings-reauth-390-<light|dark>.png (TQR-023).
if (process.env.E2E_SCREENSHOTS) {
  test('screenshots of the bank sheet with the password step', async ({ page }, info) => {
    await page.goto('/dang-ky');
    await page.getByLabel('Tên nhà hàng').fill('Phở Xác Nhận');
    await page
      .getByLabel('Email', { exact: true })
      .fill(`reauth-shots-${info.project.name}-${Date.now()}@example.com`);
    await page.getByLabel('Mật khẩu', { exact: true }).fill('mat-khau-dai-123');
    await page.getByRole('button', { name: 'Tạo nhà hàng' }).click();
    await expect(page).toHaveURL(/\/quan-ly$/);
    for (const scheme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/quan-ly/cai-dat');
      await page.getByLabel('Ngân hàng').selectOption({ label: 'Vietcombank' });
      await page.getByLabel('Số tài khoản').fill('0123456789');
      await page.getByLabel('Tên chủ tài khoản').fill('Nguyễn Văn Ánh');
      await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
      const sheet = page.getByRole('dialog', { name: 'Đổi tài khoản nhận tiền?' });
      const password = sheet.getByLabel('Mật khẩu đăng nhập của bạn', { exact: true });
      await password.fill('mat-khau-sai-1');
      await sheet.getByRole('button', { name: 'Đúng, lưu tài khoản này' }).click();
      await expect(sheet.getByText(/Mật khẩu không đúng/)).toBeVisible();
      await page.screenshot({
        path: `../docs/delivery/001-qr-table-ordering/evidence/settings-reauth-390-${scheme}.png`,
      });
      await sheet.getByRole('button', { name: 'Huỷ' }).click();
    }
  });
}
