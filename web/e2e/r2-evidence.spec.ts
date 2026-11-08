import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { test, expect, type Browser, type Page } from './support/fixtures.js';
import { sql } from './support/db.js';

/**
 * Evidence for the r2 review of the owner/staff UI, not part of CI:
 *   E2E_SCREENSHOTS=1 npx playwright test r2-evidence --project=ipad
 * Writes docs/delivery/001-qr-table-ordering/evidence/r2-<screen>-<390|1180>-<light|dark>.png.
 */
const DIR = '../docs/delivery/001-qr-table-ordering/evidence';
const PASSWORD = 'mat-khau-dai-123';
const STAFF_PASSWORD = 'nhan-vien-mat-khau-1';
const SIZES = [
  [390, 844],
  [1180, 820],
] as const;
const SCHEMES = ['light', 'dark'] as const;

const releaseOrder = (input: Record<string, unknown>): void => {
  execFileSync(process.execPath, ['scripts/e2e-release-order.ts', JSON.stringify(input)], {
    cwd: '../services/api',
    env: process.env,
  });
};

const signIn = async (page: Page, email: string, password: string) => {
  await page.goto('/dang-nhap');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).not.toHaveURL(/dang-nhap/);
};

const settle = (page: Page) =>
  page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => a))));

/** Every size and scheme: `show` puts the screen up, then it is captured as `r2-<name>-…`. */
const shoot = async (page: Page, name: string, show: () => Promise<void>) => {
  for (const [width, height] of SIZES) {
    for (const scheme of SCHEMES) {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: scheme });
      await show();
      await settle(page);
      await page.screenshot({ path: `${DIR}/r2-${name}-${String(width)}-${scheme}.png` });
    }
  }
};

const staffPage = async (browser: Browser, base: string, email: string) => {
  const context = await browser.newContext({ baseURL: base });
  const page = await context.newPage();
  await signIn(page, email, STAFF_PASSWORD);
  return page;
};

if (process.env.E2E_SCREENSHOTS) {
  test('r2 screenshots: owner, waiter, cashier and kitchen screens', async ({
    page,
    browser,
  }, info) => {
    test.setTimeout(300_000);
    const stamp = `${info.project.name}-${String(Date.now())}`;
    await page.goto('/dang-ky');
    await page.getByLabel('Tên nhà hàng').fill('Nhà hàng Lẩu Nấm Ashima Phố Cổ Hà Nội');
    await page.getByLabel('Email', { exact: true }).fill(`r2-owner-${stamp}@example.com`);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Tạo nhà hàng' }).click();
    await expect(page).toHaveURL(/\/quan-ly$/);

    const api = page.request;
    const me = (await (await api.get('/api/me')).json()) as { restaurant: { id: string } };
    const menu = (await (await api.get('/api/menu')).json()) as { stations: { id: string }[] };
    const stationId = menu.stations[0]?.id;
    const bar = (await (
      await api.post('/api/menu/stations', { data: { name: 'Quầy bar', lateAfterMinutes: 5 } })
    ).json()) as { id: string };
    const category = (await (
      await api.post('/api/menu/categories', { data: { name: 'Món chính', isMain: true } })
    ).json()) as { id: string };
    for (const [name, priceVnd, station] of [
      ['Phở bò tái', 45_000, stationId],
      ['Bún chả Hà Nội', 55_000, stationId],
      ['Trà đá', 5_000, bar.id],
    ] as const) {
      const created = await api.post('/api/menu/items', {
        data: { name, priceVnd, categoryId: category.id, stationId: station },
      });
      expect(created.ok()).toBe(true);
    }
    for (const name of ['Bàn 1', 'Bàn 2', 'Bàn 3']) {
      expect((await api.post('/api/tables', { data: { name, seats: 4 } })).ok()).toBe(true);
    }
    const emails: Record<'waiter' | 'cashier' | 'kitchen', string> = {
      waiter: `r2-waiter-${stamp}@example.com`,
      cashier: `r2-cashier-${stamp}@example.com`,
      kitchen: `r2-kitchen-${stamp}@example.com`,
    };
    const names = { waiter: 'Chị Lan', cashier: 'Anh Minh', kitchen: 'Anh Bếp' };
    for (const role of ['waiter', 'cashier', 'kitchen'] as const) {
      const added = await api.post('/api/staff', {
        data: {
          displayName: names[role],
          email: emails[role],
          password: STAFF_PASSWORD,
          role,
        },
      });
      expect(added.ok()).toBe(true);
    }
    const restaurantId = me.restaurant.id;
    releaseOrder({
      restaurantId,
      tableName: 'Bàn 1',
      partySize: 3,
      minutesAgo: 18,
      items: [
        { menuItemName: 'Phở bò tái', quantity: 2, note: 'Không hành' },
        { menuItemName: 'Trà đá', quantity: 3 },
      ],
    });
    releaseOrder({
      restaurantId,
      tableName: 'Bàn 2',
      minutesAgo: 4,
      items: [{ menuItemName: 'Bún chả Hà Nội' }, { menuItemName: 'Phở bò tái' }],
    });
    // Bàn 1's drinks are ready for the waiter.
    sql(`update order_items set status = 'done', started_at = now(), done_at = now(),
           version = version + 1
         where restaurant_id = '${restaurantId}' and name_snapshot = 'Trà đá'`);

    // Owner screens.
    await shoot(page, 'owner-overview', async () => {
      await page.goto('/quan-ly');
      await expect(page.getByRole('heading', { name: 'Vận hành' })).toBeVisible();
    });
    await page.setViewportSize({ width: 390, height: 844 });
    for (const scheme of SCHEMES) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/quan-ly');
      await page.getByRole('button', { name: 'Thêm' }).click();
      await expect(page.getByRole('dialog', { name: 'Các trang khác' })).toBeVisible();
      await settle(page);
      await page.screenshot({ path: `${DIR}/r2-owner-more-390-${scheme}.png` });
    }
    await shoot(page, 'menu', async () => {
      await page.goto('/quan-ly/thuc-don');
      await expect(page.getByText('Bún chả Hà Nội')).toBeVisible();
    });
    await shoot(page, 'menu-item-sheet', async () => {
      await page.goto('/quan-ly/thuc-don');
      await page.getByRole('button', { name: 'Sửa món Phở bò tái' }).click();
      await expect(page.getByRole('button', { name: 'Xoá món' })).toBeInViewport();
    });
    await shoot(page, 'menu-delete-refused', async () => {
      await page.goto('/quan-ly/thuc-don');
      await page.getByRole('button', { name: 'Sửa món Phở bò tái' }).click();
      await page.getByRole('button', { name: 'Xoá món' }).click();
      await page
        .getByRole('dialog', { name: 'Xoá món?' })
        .getByRole('button', { name: 'Xoá' })
        .click();
      await expect(page.getByRole('dialog', { name: 'Không xoá được Phở bò tái' })).toBeVisible();
    });
    await shoot(page, 'tables-delete-refused', async () => {
      await page.goto('/quan-ly/ban');
      await page.getByRole('button', { name: 'Xoá Bàn 1' }).click();
      await page
        .getByRole('dialog', { name: 'Xoá Bàn 1?' })
        .getByRole('button', { name: 'Xoá bàn' })
        .click();
      await expect(page.getByRole('dialog', { name: 'Không xoá được Bàn 1' })).toBeVisible();
    });
    await shoot(page, 'settings-invalid', async () => {
      await page.goto('/quan-ly/cai-dat');
      await page.getByLabel('Ngân hàng').selectOption({ label: 'Vietcombank' });
      await page.getByLabel('Số tài khoản').fill('123');
      await page.getByLabel('Tên chủ tài khoản').fill('Nguyễn Văn Ánh');
      await page.locator('main').evaluate((main) => main.scrollTo(0, 0));
      await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
      await expect(page.getByLabel('Số tài khoản')).toBeFocused();
      await expect(page.getByLabel('Số tài khoản')).toBeInViewport();
    });
    await shoot(page, 'owner-kitchen', async () => {
      await page.goto('/bep');
      await expect(page.getByRole('region', { name: /^Đang chờ/ })).toBeVisible();
    });

    // Floor staff, each on their own device.
    const base = new URL(page.url()).origin;
    const waiter = await staffPage(browser, base, emails.waiter);
    await shoot(waiter, 'waiter-serving', async () => {
      await waiter.goto('/phuc-vu');
      await expect(waiter.getByRole('article').first()).toBeVisible();
    });
    await shoot(waiter, 'waiter-review', async () => {
      await waiter.goto('/phuc-vu/duyet');
      await expect(waiter.getByRole('heading', { level: 1 })).toBeVisible();
    });
    const cashier = await staffPage(browser, base, emails.cashier);
    await shoot(cashier, 'cashier', async () => {
      await cashier.goto('/thu-ngan');
      await expect(cashier.getByText('Bàn 1').first()).toBeVisible();
    });
    const kitchen = await staffPage(browser, base, emails.kitchen);
    await shoot(kitchen, 'kitchen', async () => {
      await kitchen.goto('/bep');
      await expect(kitchen.getByRole('region', { name: /^Đang chờ/ })).toBeVisible();
    });
  });
}
