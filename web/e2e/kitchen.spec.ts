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

test('TQR-025 the kitchen drops a dish it cannot make ("Bỏ món") after a confirmation', async ({
  page,
}, info) => {
  const r = await setUpRestaurant(page, `drop-${info.project.name}`);
  releaseOrder({
    restaurantId: r.id,
    tableName: 'Bàn 3',
    items: [{ menuItemName: 'Phở bò tái' }],
  });
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await signIn(page, r.kitchenEmail, STAFF_PASSWORD);
  const ticket = page
    .getByRole('region', { name: /^Đang chờ/ })
    .getByRole('article', { name: 'Bàn 3 · 2 khách' });
  await expect(ticket).toBeVisible();
  await ticket.getByRole('button', { name: 'Bỏ món' }).click();
  const sheet = page.getByRole('dialog', { name: 'Bỏ Phở bò tái của Bàn 3?' });
  await expect(sheet).toContainText('Khách sẽ thấy món “Đã huỷ”');
  await expectNoSeriousA11yIssues(page);
  await sheet.getByRole('button', { name: 'Bỏ món' }).click();
  await expect(page.getByRole('status').first()).toContainText(
    'Đã bỏ Phở bò tái của Bàn 3. Hoá đơn của bàn đã được cập nhật.',
  );
  await expect(page.getByRole('article', { name: 'Bàn 3 · 2 khách' })).toHaveCount(0);
});

/**
 * TQR-027/028: a stand-in for the browser's speech, installed before the app loads. It records
 * every sentence in `window.__spoken` and ends each one at once, as a real voice would later.
 */
const recordSpeech = (page: Page) =>
  page.addInitScript(() => {
    const spoken: string[] = [];
    (window as unknown as { __spoken: string[] }).__spoken = spoken;
    class Utterance {
      lang = '';
      voice: unknown = null;
      rate = 1;
      volume = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(readonly text: string) {}
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utterance });
    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        speak: (u: Utterance) => {
          if (u.text !== '') spoken.push(`${u.lang}|${u.text}`);
          setTimeout(() => u.onend?.(), 0);
        },
        cancel: () => undefined,
        getVoices: () => [],
      },
    });
  });

const spokenOn = (page: Page) =>
  page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);

test('TQR-027/028 the kitchen hears new orders and overdue reminders until the dish is done', async ({
  page,
}, info) => {
  const r = await setUpRestaurant(page, `voice-${info.project.name}`);
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await recordSpeech(page);
  await page.clock.install();
  await signIn(page, r.kitchenEmail, STAFF_PASSWORD);
  await expect(page).toHaveURL(/\/bep$/);
  await expect(page.getByText('Chưa có món nào cần làm')).toBeVisible();

  // The first tap turns the voice on and says so (iOS needs a tap before any sound).
  const toggle = page.getByRole('switch', { name: 'Bật đọc to' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => spokenOn(page)).toEqual(['vi-VN|Đã bật đọc to']);
  await expectNoSeriousA11yIssues(page);

  // A released order is read aloud as one sentence.
  releaseOrder({
    restaurantId: r.id,
    tableName: 'Bàn 1',
    items: [{ menuItemName: 'Phở bò tái', quantity: 2 }],
  });
  await expect.poll(() => spokenOn(page)).toContain('vi-VN|Bàn 1: hai phở bò tái');

  // Ten minutes later (the default reminder) it is reminded, and the ticket says "Trễ".
  await page.clock.fastForward('10:30');
  await expect
    .poll(() => spokenOn(page))
    .toContain('vi-VN|Bàn 1 gọi hai phở bò tái đã 10 phút, chưa ra món');
  const ticket = page.getByRole('article', { name: 'Bàn 1 · 2 khách' });
  await expect(ticket).toContainText('Trễ 10 phút');

  // Done → never reminded again.
  await ticket.getByRole('button', { name: 'Bắt đầu nấu' }).click();
  await page
    .getByRole('region', { name: 'Đang nấu (1)' })
    .getByRole('button', { name: 'Xong' })
    .click();
  await expect(page.getByText('Chưa có món nào cần làm')).toBeVisible();
  // (21 browser minutes with no real time passing also look like a dead stream — TQR-031 says
  // "Mất kết nối máy chủ" — so only reminders are counted here.)
  const reminders = async () => (await spokenOn(page)).filter((s) => s.includes(' gọi '));
  const before = (await reminders()).length;
  await page.clock.fastForward('21:00');
  await page.clock.runFor(1_000);
  expect(await reminders()).toHaveLength(before);

  // The choice is remembered on this iPad.
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Bật đọc to' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('TQR-031 a silently dead stream shows "Mất kết nối" and is said aloud, then recovers', async ({
  page,
}, info) => {
  const r = await setUpRestaurant(page, `dead-${info.project.name}`);
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await recordSpeech(page);
  await page.clock.install();
  await signIn(page, r.kitchenEmail, STAFF_PASSWORD);
  await expect(page).toHaveURL(/\/bep$/);
  releaseOrder({
    restaurantId: r.id,
    tableName: 'Bàn 1',
    items: [{ menuItemName: 'Phở bò tái', quantity: 1 }],
  });
  await expect(page.getByRole('article', { name: 'Bàn 1 · 2 khách' })).toBeVisible();
  await page.getByRole('switch', { name: 'Bật đọc to' }).click();
  await expect.poll(() => spokenOn(page)).toEqual(['vi-VN|Đã bật đọc to']);
  const banner = page.getByRole('status').filter({ hasText: 'Mất kết nối — đang kết nối lại…' });
  await expect(banner).toHaveCount(0);

  // The API goes away behind the proxy: the open stream stays "open" but nothing arrives, and
  // every new attempt fails. 2.5 heartbeats (15 s each) of silence later the screen says so.
  await page.route('**/api/stream/station/**', (route) => route.abort());
  await page.clock.fastForward('00:40');
  await expect(banner).toBeVisible();
  await page.clock.fastForward('00:06');
  await expect.poll(() => spokenOn(page)).toContain('vi-VN|Mất kết nối máy chủ');
  // Said once, however long it stays down.
  await page.clock.fastForward('01:00');
  expect((await spokenOn(page)).filter((s) => s.endsWith('Mất kết nối máy chủ'))).toHaveLength(1);

  // The API is back: the next attempt gets a snapshot, the banner goes, the voice says so and
  // the dish already on screen is not read again.
  await page.unroute('**/api/stream/station/**');
  await expect
    .poll(async () => {
      await page.clock.fastForward('00:05');
      return spokenOn(page);
    })
    .toContain('vi-VN|Đã kết nối lại');
  await expect(banner).toHaveCount(0);
  expect((await spokenOn(page)).filter((s) => s.includes('Bàn 1: '))).toHaveLength(0);
});

// Evidence for review, not part of CI: E2E_SCREENSHOTS=1 npx playwright test kitchen --project=ipad
if (process.env.E2E_SCREENSHOTS) {
  test('screenshots of the kitchen voice toggle (TQR-027)', async ({ page }) => {
    const r = await setUpRestaurant(page, 'voice-shots');
    releaseOrder({
      restaurantId: r.id,
      tableName: 'Bàn 3',
      minutesAgo: 12,
      partySize: 4,
      items: [{ menuItemName: 'Phở bò tái', quantity: 2, note: 'Không hành' }],
    });
    releaseOrder({
      restaurantId: r.id,
      tableName: 'Bàn 1',
      minutesAgo: 2,
      items: [{ menuItemName: 'Trà đá', quantity: 3 }],
    });
    await page.getByRole('button', { name: 'Đăng xuất' }).click();
    await recordSpeech(page);
    await signIn(page, r.kitchenEmail, STAFF_PASSWORD);
    await page.setViewportSize({ width: 1180, height: 820 });
    await page.getByRole('switch', { name: 'Bật đọc to' }).click();
    await expect
      .poll(() => spokenOn(page))
      .toContain('vi-VN|Bàn 3 gọi hai phở bò tái đã 12 phút, chưa ra món');
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await settle(page);
      await page.screenshot({
        path: `${EVIDENCE}/kitchen-voice-1180-${scheme}.png`,
        fullPage: true,
      });
    }
  });

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
    // TQR-025 "Bỏ món" sheet, then back out of it.
    await page
      .getByRole('article', { name: 'Bàn 2 · 4 khách' })
      .first()
      .getByRole('button', { name: 'Bỏ món' })
      .click();
    const drop = page.getByRole('dialog', { name: 'Bỏ Phở bò tái của Bàn 2?' });
    await expect(drop).toBeVisible();
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await settle(page);
      await page.screenshot({ path: `${EVIDENCE}/kitchen-drop-1180-${scheme}.png` });
    }
    await drop.getByRole('button', { name: 'Huỷ' }).click();
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
