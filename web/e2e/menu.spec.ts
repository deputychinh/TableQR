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

const signUp = async (page: Page, label: string) => {
  await page.goto('/dang-ky');
  await page.getByLabel('Tên nhà hàng').fill(`Quán Thực Đơn ${label}`);
  await page
    .getByLabel('Email', { exact: true })
    .fill(`menu-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('mat-khau-dai-123');
  await page.getByRole('button', { name: 'Tạo nhà hàng' }).click();
  await expect(page).toHaveURL(/\/quan-ly$/);
};

/** Station, main-dish category and two items, the second on the bar. */
const buildMenu = async (page: Page) => {
  await page.getByRole('link', { name: 'Thực đơn' }).first().click();
  await expect(page.getByText('Chưa có món nào')).toBeVisible();

  await page.getByRole('button', { name: 'Thêm khu bếp' }).click();
  const station = page.getByRole('dialog', { name: 'Thêm khu bếp' });
  await station.getByLabel('Tên khu bếp').fill('Quầy bar');
  await station.getByLabel('Báo trễ sau (phút)').fill('5');
  await station.getByRole('button', { name: 'Lưu' }).click();
  await expect(page.getByText('Báo trễ sau 5 phút')).toBeVisible();

  await page.getByRole('button', { name: 'Thêm món đầu tiên' }).click();
  const category = page.getByRole('dialog', { name: 'Thêm nhóm món' });
  await category.getByLabel('Tên nhóm').fill('Món chính');
  await category.getByRole('switch', { name: 'Đây là nhóm món chính' }).click();
  await category.getByRole('button', { name: 'Lưu' }).click();

  const first = page.getByRole('dialog', { name: 'Thêm món' });
  await first.getByLabel('Tên món').fill('Phở bò tái');
  await first.getByLabel('Giá bán').fill('45.000');
  await first.getByLabel('Mô tả (không bắt buộc)').fill('Bánh phở, bò tái, hành lá');
  await first.getByRole('button', { name: 'Lưu' }).click();
  await expect(first).toBeHidden();

  await page.getByRole('button', { name: 'Thêm món', exact: true }).click();
  const second = page.getByRole('dialog', { name: 'Thêm món' });
  await second.getByLabel('Tên món').fill('Trà đá');
  await second.getByLabel('Giá bán').fill('999');
  await second.getByRole('button', { name: 'Lưu' }).click();
  await expect(second.getByText('Giá thấp nhất là 1.000 ₫.')).toBeVisible();
  await second.getByLabel('Giá bán').fill('5000');
  await second.getByLabel('Khu bếp làm món này').selectOption({ label: 'Quầy bar' });
  await second.getByRole('button', { name: 'Lưu' }).click();
  await expect(second).toBeHidden();
  await expect(page.getByText(/^5\.000\s₫$/u)).toBeVisible();
};

test('owner builds a menu, marks a dish "hết món" and previews it as a guest', async ({
  page,
}, info) => {
  await signUp(page, info.project.name);
  await buildMenu(page);
  await expectNoSeriousA11yIssues(page);

  const toggle = page.getByRole('switch', { name: 'Còn món: Trà đá' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Còn món: Trà đá' })).toHaveAttribute(
    'aria-checked',
    'false',
  );

  await page.getByRole('link', { name: 'Xem như khách' }).click();
  await expect(page).toHaveURL(/\/quan-ly\/thuc-don\/xem-truoc$/);
  const soldOut = page.getByRole('listitem').filter({ hasText: 'Trà đá' });
  await expect(soldOut).toContainText('Hết món');
  const available = page.getByRole('listitem').filter({ hasText: 'Phở bò tái' });
  await expect(available).not.toContainText('Hết món');
  await expect(available).toContainText(/45\.000\s₫/u);
  await expectNoSeriousA11yIssues(page);
});

test('a category with items cannot be deleted and the sheet says why', async ({ page }, info) => {
  await signUp(page, `del-${info.project.name}`);
  await buildMenu(page);
  await page.getByRole('button', { name: 'Xoá nhóm Món chính' }).click();
  const confirm = page.getByRole('dialog', { name: 'Xoá nhóm món?' });
  await expectNoSeriousA11yIssues(page);
  await confirm.getByRole('button', { name: 'Xoá' }).click();
  await expect(confirm.getByRole('alert')).toContainText('Nhóm món này còn món');
});

// Evidence for review, not part of CI: E2E_SCREENSHOTS=1 npx playwright test menu --project=ipad
if (process.env.E2E_SCREENSHOTS) {
  test('screenshots of the menu screens', async ({ page }) => {
    await signUp(page, 'shots');
    await buildMenu(page);
    await page.getByRole('switch', { name: 'Còn món: Trà đá' }).click();
    const dir = '../docs/delivery/001-qr-table-ordering/evidence';
    for (const width of [390, 1180]) {
      for (const scheme of ['light', 'dark'] as const) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 820 });
        await page.emulateMedia({ colorScheme: scheme });
        await page.goto('/quan-ly');
        await page.goto('/quan-ly/thuc-don');
        await expect(page.getByText('Trà đá')).toBeVisible();
        await page.screenshot({ path: `${dir}/menu-${width}-${scheme}.png`, fullPage: true });
        await page.getByRole('button', { name: 'Sửa món Phở bò tái' }).click();
        await expect(page.getByRole('dialog', { name: 'Sửa món' })).toBeVisible();
        await page.screenshot({ path: `${dir}/menu-item-sheet-${width}-${scheme}.png` });
        await page.keyboard.press('Escape');
        await page.goto('/quan-ly/thuc-don/xem-truoc');
        await expect(page.getByText('Hết món')).toBeVisible();
        await page.screenshot({
          path: `${dir}/menu-preview-${width}-${scheme}.png`,
          fullPage: true,
        });
      }
    }
  });
}
