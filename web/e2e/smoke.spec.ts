import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('home skeleton', () => {
  test('shows the API as up when /health answers ok', async ({ page }) => {
    await page.route('**/api/health', (route) =>
      route.fulfill({ json: { status: 'ok', db: 'up' } }),
    );
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('TableQR');
    await expect(page.getByText('Máy chủ và cơ sở dữ liệu đang hoạt động')).toBeVisible();
  });

  test('shows a retry button when the API is down, and has no serious a11y issues', async ({
    page,
  }) => {
    await page.route('**/api/health', (route) => route.abort());
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Thử lại' })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious).toEqual([]);
  });
});
