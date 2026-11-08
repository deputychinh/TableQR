import { execFileSync } from 'node:child_process';
import process from 'node:process';
import {
  test,
  expect,
  devices,
  type APIRequestContext,
  type Browser,
  type Page,
} from './support/fixtures.js';
import AxeBuilder from '@axe-core/playwright';

const PASSWORD = 'mat-khau-dai-123';
const STAFF_PASSWORD = 'nhan-vien-mat-khau-1';
const EVIDENCE = '../docs/delivery/001-qr-table-ordering/evidence';

const expectNoSeriousA11yIssues = async (page: Page) => {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
  ).toEqual([]);
};

const signIn = async (page: Page, email: string, password: string) => {
  await page.goto('/dang-nhap');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
};

/** The released-order fixture (services/api/scripts/e2e-release-order.ts), on the e2e database. */
const releaseOrder = (input: Record<string, unknown>): string[] =>
  JSON.parse(
    execFileSync(process.execPath, ['scripts/e2e-release-order.ts', JSON.stringify(input)], {
      cwd: '../services/api',
      env: process.env,
    }).toString(),
  ) as string[];

interface Restaurant {
  id: string;
  kitchenEmail: string;
  waiterEmail: string;
}

/** Owner signs up; menu, tables and staff are added through the API with the owner's cookie. */
const setUpRestaurant = async (page: Page, label: string): Promise<Restaurant> => {
  const stamp = `${label}-${String(Date.now())}-${Math.random().toString(36).slice(2, 6)}`;
  await page.goto('/dang-ky');
  await page.getByLabel('Tên nhà hàng').fill(`Quán Bếp ${stamp}`);
  await page.getByLabel('Email', { exact: true }).fill(`owner-${stamp}@example.com`);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Tạo nhà hàng' }).click();
  await expect(page).toHaveURL(/\/quan-ly$/);
  const api: APIRequestContext = page.request;
  const json = async (response: Awaited<ReturnType<APIRequestContext['get']>>) => {
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()) as Record<string, unknown>;
  };
  const me = await json(await api.get('/api/me'));
  const menu = await json(await api.get('/api/menu'));
  const stationId = (menu.stations as { id: string }[])[0]?.id;
  const category = await json(
    await api.post('/api/menu/categories', { data: { name: 'Món chính', isMain: true } }),
  );
  for (const [name, priceVnd] of [
    ['Phở bò tái', 45_000],
    ['Trà đá', 5_000],
  ] as const) {
    await json(
      await api.post('/api/menu/items', {
        data: { name, priceVnd, categoryId: category.id, stationId },
      }),
    );
  }
  for (const name of ['Bàn 1', 'Bàn 2', 'Bàn 3']) {
    await json(await api.post('/api/tables', { data: { name, seats: 4 } }));
  }
  const staff = async (role: 'kitchen' | 'waiter') => {
    const email = `${role}-${stamp}@example.com`;
    await json(
      await api.post('/api/staff', {
        data: {
          displayName: role === 'kitchen' ? 'Anh Bếp' : 'Chị Phục Vụ',
          email,
          password: STAFF_PASSWORD,
          role,
        },
      }),
    );
    return email;
  };
  const restaurant = (me.restaurant as { id: string }).id;
  return {
    id: restaurant,
    kitchenEmail: await staff('kitchen'),
    waiterEmail: await staff('waiter'),
  };
};

/** Waits for running CSS transitions (e.g. after a colour-scheme switch) before a screenshot. */
const settle = (page: Page) =>
  page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));

/** A phone for the waiter next to the kitchen iPad (its own cookies). */
const phone = async (browser: Browser, page: Page) => {
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    baseURL: new URL(page.url()).origin,
  });
  return context.newPage();
};

test('S9/S10 the kitchen cooks in arrival order, the waiter serves and sees "Đủ món"', async ({
  page,
  browser,
}, info) => {
  const r = await setUpRestaurant(page, info.project.name);
  // Bàn 1 ordered 20 minutes ago (late), Bàn 2 just now: same dish, Bàn 1 first.
  releaseOrder({
    restaurantId: r.id,
    tableName: 'Bàn 1',
    partySize: 3,
    minutesAgo: 20,
    items: [{ menuItemName: 'Phở bò tái', quantity: 2, note: 'Không hành' }],
  });
  releaseOrder({
    restaurantId: r.id,
    tableName: 'Bàn 2',
    minutesAgo: 1,
    items: [{ menuItemName: 'Phở bò tái' }],
  });

  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await signIn(page, r.kitchenEmail, STAFF_PASSWORD);
  await expect(page).toHaveURL(/\/bep$/);
  await expect(page.getByRole('region', { name: 'Đang chờ (2)' })).toBeVisible();
  const waiting = page.getByRole('region', { name: /^Đang chờ/ });
  await expect(waiting.getByRole('heading', { level: 3 })).toHaveText([
    'Bàn 1 · 3 khách',
    'Bàn 2 · 2 khách',
  ]);
  const first = waiting.getByRole('article', { name: 'Bàn 1 · 3 khách' });
  await expect(first).toContainText('Trễ');
  await expect(first).toContainText('Ghi chú: Không hành');
  await expect(first).toContainText('Chờ 20 phút');
  await expectNoSeriousA11yIssues(page);

  // The waiter's phone is open before anything is ready.
  const waiter = await phone(browser, page);
  await signIn(waiter, r.waiterEmail, STAFF_PASSWORD);
  await expect(waiter).toHaveURL(/\/phuc-vu$/);
  await expect(waiter.getByText('Chưa có món nào xong')).toBeVisible();
  await expect(waiter.getByRole('link', { name: 'Đơn chờ duyệt' })).toHaveAttribute(
    'href',
    '/phuc-vu/duyet',
  );

  // A new order reaches the kitchen live (the ordering flow publishes on release).
  releaseOrder({
    restaurantId: r.id,
    tableName: 'Bàn 3',
    items: [{ menuItemName: 'Trà đá' }],
  });
  await expect(page.getByRole('region', { name: 'Đang chờ (3)' })).toBeVisible();

  // The cook does Bàn 2 first: finishing it asks for a reason (AC32).
  await waiting
    .getByRole('article', { name: 'Bàn 2 · 2 khách' })
    .getByRole('button', { name: 'Bắt đầu nấu' })
    .click();
  const cooking = page.getByRole('region', { name: 'Đang nấu (1)' });
  await cooking.getByRole('button', { name: 'Xong' }).click();
  const sheet = page.getByRole('dialog', { name: 'Có bàn gọi món này trước' });
  await expect(sheet).toContainText('Bàn 1 gọi Phở bò tái trước bàn này');
  await expectNoSeriousA11yIssues(page);
  await sheet.getByLabel('Lý do làm bàn này trước').fill('Bàn 2 có trẻ nhỏ');
  await sheet.getByRole('button', { name: 'Xong món này' }).click();
  await expect(page.getByRole('status').first()).toContainText('Phở bò tái cho Bàn 2 đã xong.');

  // The waiter sees it appear without reloading (AC31, AC35).
  await expect(waiter.getByRole('article', { name: 'Bàn 2 · 2 khách' })).toContainText(
    'Phở bò tái',
  );

  // Bàn 1 and Bàn 3 next, in order: no reason needed.
  for (const table of ['Bàn 1 · 3 khách', 'Bàn 3 · 2 khách']) {
    await page
      .getByRole('article', { name: table })
      .getByRole('button', { name: 'Bắt đầu nấu' })
      .click();
    await page.getByRole('article', { name: table }).getByRole('button', { name: 'Xong' }).click();
    await expect(page.getByRole('article', { name: table })).toHaveCount(0);
  }
  await expect(page.getByText('Chưa có món nào cần làm')).toBeVisible();

  // The waiter: ready dishes by table, oldest first; serving Bàn 2 shows "Đủ món" (AC36, AC37).
  await expect(waiter.getByRole('article')).toHaveCount(3);
  await expect(waiter.getByRole('article').first()).toHaveAccessibleName('Bàn 2 · 2 khách');
  await expectNoSeriousA11yIssues(waiter);
  await waiter
    .getByRole('article', { name: 'Bàn 2 · 2 khách' })
    .getByRole('button', { name: 'Đã ra bàn' })
    .click();
  await expect(waiter.getByRole('status')).toContainText('Đã ra bàn: Phở bò tái cho Bàn 2.');
  await expect(
    waiter.getByRole('listitem').filter({ hasText: 'Bàn 2' }).filter({ hasText: 'Đủ món' }),
  ).toBeVisible();
  await expect(waiter.getByRole('article')).toHaveCount(2);
  await expectNoSeriousA11yIssues(waiter);
  await waiter.context().close();
});

// Evidence for review, not part of CI: E2E_SCREENSHOTS=1 npx playwright test kitchen --project=ipad
if (process.env.E2E_SCREENSHOTS) {
  test('screenshots of the kitchen and waiter screens', async ({ page, browser }) => {
    const r = await setUpRestaurant(page, 'shots');
    for (const [table, minutesAgo, items] of [
      ['Bàn 1', 22, [{ menuItemName: 'Phở bò tái', quantity: 2, note: 'Không hành, thêm chanh' }]],
      ['Bàn 2', 9, [{ menuItemName: 'Phở bò tái' }, { menuItemName: 'Trà đá', quantity: 3 }]],
      ['Bàn 3', 1, [{ menuItemName: 'Trà đá' }]],
    ] as const) {
      releaseOrder({ restaurantId: r.id, tableName: table, minutesAgo, items, partySize: 4 });
    }
    await page.getByRole('button', { name: 'Đăng xuất' }).click();
    await signIn(page, r.kitchenEmail, STAFF_PASSWORD);
    await page.setViewportSize({ width: 1180, height: 820 });
    await page
      .getByRole('article', { name: 'Bàn 1 · 4 khách' })
      .getByRole('button', { name: 'Bắt đầu nấu' })
      .click();
    await expect(page.getByRole('region', { name: 'Đang nấu (1)' })).toBeVisible();
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await settle(page); // let button colour transitions finish
      await page.screenshot({ path: `${EVIDENCE}/kitchen-1180-${scheme}.png`, fullPage: true });
    }
    // Skip sheet: start Bàn 2's phở and try to finish it before Bàn 1's.
    await page
      .getByRole('article', { name: 'Bàn 2 · 4 khách' })
      .first()
      .getByRole('button', { name: 'Bắt đầu nấu' })
      .click();
    await page
      .getByRole('region', { name: 'Đang nấu (2)' })
      .getByRole('article', { name: 'Bàn 2 · 4 khách' })
      .getByRole('button', { name: 'Xong' })
      .click();
    await expect(page.getByRole('dialog', { name: 'Có bàn gọi món này trước' })).toBeVisible();
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await settle(page);
      await page.screenshot({ path: `${EVIDENCE}/kitchen-skip-1180-${scheme}.png` });
    }
    const dialog = page.getByRole('dialog', { name: 'Có bàn gọi món này trước' });
    await dialog.getByLabel('Lý do làm bàn này trước').fill('Khách giục');
    await dialog.getByRole('button', { name: 'Xong món này' }).click();
    await page
      .getByRole('article', { name: 'Bàn 1 · 4 khách' })
      .getByRole('button', { name: 'Xong' })
      .click();
    // The rest in queue order: no reason needed.
    for (let left = 2; left > 0; left -= 1) {
      await page
        .getByRole('region', { name: `Đang chờ (${String(left)})` })
        .getByRole('button', { name: 'Bắt đầu nấu' })
        .first()
        .click();
      await page
        .getByRole('region', { name: 'Đang nấu (1)' })
        .getByRole('button', { name: 'Xong' })
        .click();
      await expect(
        page.getByRole('region', { name: /^Đang nấu/ }).getByRole('article'),
      ).toHaveCount(0);
    }

    const waiter = await phone(browser, page);
    await signIn(waiter, r.waiterEmail, STAFF_PASSWORD);
    await waiter
      .getByRole('article', { name: 'Bàn 3 · 4 khách' })
      .getByRole('button', { name: 'Đã ra bàn' })
      .click();
    await expect(waiter.getByText('Đủ món')).toBeVisible();
    for (const scheme of ['light', 'dark'] as const) {
      await waiter.emulateMedia({ colorScheme: scheme });
      await waiter.evaluate(() => window.scrollTo(0, 0));
      await settle(waiter);
      await waiter.screenshot({ path: `${EVIDENCE}/serving-390-${scheme}.png`, fullPage: true });
    }
    await waiter.context().close();
  });
}
