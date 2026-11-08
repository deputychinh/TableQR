import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import process from 'node:process';
import {
  test,
  expect,
  type APIRequestContext,
  type Browser,
  type Page,
  type TestInfo,
} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PASSWORD = 'mat-khau-dai-123';
const STAFF_PASSWORD = 'thu-ngan-mat-khau-1';
const SIZES = [
  [390, 844],
  [1180, 820],
] as const;
const BANK = { bin: '970436', accountNumber: '0123456789', accountName: 'Nguyễn Văn Ánh' };

const expectNoSeriousA11yIssues = async (page: Page) => {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
  ).toEqual([]);
};

/** The e2e database (Makefile `E2E_DB`), reached through the compose `db` service. */
const sql = (statement: string): string => {
  const url = new URL(
    process.env.TQR_DATABASE_URL ?? 'postgresql://tableqr:tableqr@127.0.0.1:55432/tableqr',
  );
  return execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'db',
      'psql',
      '-U',
      'tableqr',
      '-d',
      url.pathname.slice(1),
      '-v',
      'ON_ERROR_STOP=1',
      '-qtA',
      '-c',
      statement,
    ],
    { cwd: '..', encoding: 'utf8' },
  ).trim();
};

/**
 * Owner, cashier, bank account (API) + one table with an open session, a served order and a guest
 * phone (database). Guest check-in and ordering (TQR-011/012) are not on main yet, so the session
 * and the `tqr_guest` cookie are written straight into the tables they will use.
 */
const seed = async (api: APIRequestContext, stamp: string) => {
  const signUp = await api.post('/api/auth/signup', {
    data: {
      restaurantName: 'Bún Chả Thu Ngân',
      email: `bill-owner-${stamp}@example.com`,
      password: PASSWORD,
    },
  });
  expect(signUp.status()).toBe(201);
  const restaurantId = ((await signUp.json()) as { restaurant: { id: string } }).restaurant.id;
  const rules = ((await (await api.get('/api/restaurant/settings')).json()) as { rules: unknown })
    .rules;
  expect((await api.put('/api/restaurant/settings', { data: { rules, bank: BANK } })).ok()).toBe(
    true,
  );
  const cashierEmail = `bill-cashier-${stamp}@example.com`;
  const staff = await api.post('/api/staff', {
    data: { displayName: 'Lan', email: cashierEmail, password: STAFF_PASSWORD, role: 'cashier' },
  });
  expect(staff.status()).toBe(201);

  const ids = {
    table: randomUUID(),
    station: randomUUID(),
    category: randomUUID(),
    item: randomUUID(),
    session: randomUUID(),
    order: randomUUID(),
  };
  const qrToken = randomBytes(16).toString('base64url');
  const guestToken = randomBytes(32).toString('base64url');
  const guestHash = createHash('sha256').update(guestToken).digest('hex');
  const r = `'${restaurantId}'`;
  sql(`
    insert into dining_tables (id, restaurant_id, name, seats, qr_token)
      values ('${ids.table}', ${r}, 'Bàn 7', 4, '${qrToken}');
    insert into stations (id, restaurant_id, name) values ('${ids.station}', ${r}, 'Bếp');
    insert into categories (id, restaurant_id, name, is_main, sort_order)
      values ('${ids.category}', ${r}, 'Món chính', true, 1);
    insert into menu_items (id, restaurant_id, category_id, station_id, name, price_vnd)
      values ('${ids.item}', ${r}, '${ids.category}', '${ids.station}', 'Bún chả', 55000);
    insert into table_sessions (id, restaurant_id, table_id, party_size, opened_by)
      values ('${ids.session}', ${r}, '${ids.table}', 2, 'guest');
    insert into guest_devices (token_hash, restaurant_id, session_id)
      values ('${guestHash}', ${r}, '${ids.session}');
    insert into orders (id, restaurant_id, session_id, idempotency_key, status, placed_by,
        released_at, total_vnd, rules_snapshot)
      values ('${ids.order}', ${r}, '${ids.session}', 'e2e-1', 'released', 'guest', now(),
        125000, '{}'::jsonb);
    insert into order_items (restaurant_id, order_id, session_id, menu_item_id, station_id,
        name_snapshot, price_vnd, is_main, quantity, status, queue_at, session_opened_at)
      values
        (${r}, '${ids.order}', '${ids.session}', '${ids.item}', '${ids.station}', 'Bún chả',
          55000, 'yes', 2, 'served', now(), now()),
        (${r}, '${ids.order}', '${ids.session}', '${ids.item}', '${ids.station}', 'Trà đá',
          5000, 'no', 3, 'served', now(), now());
  `);
  return { qrToken, guestToken, cashierEmail };
};

/** A second device of the same kind with its own cookies (the guest's phone, the cashier's iPad). */
const newPage = async (browser: Browser, info: TestInfo, baseURL: string) => {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = info.project.use;
  const context = await browser.newContext({
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    baseURL,
  });
  return context.newPage();
};

const signIn = async (page: Page, email: string) => {
  await page.context().clearCookies(); // the owner signed up in this context during the seed
  await page.goto('/dang-nhap');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(STAFF_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).toHaveURL(/\/thu-ngan$/);
};

test('AC40/AC44/AC46: guest sees the VietQR bill, the cashier confirms the transfer, the guest page turns "Đã thanh toán"', async ({
  page,
  browser,
  baseURL,
}, info) => {
  const stamp = `${info.project.name}-${String(Date.now())}`;
  const { qrToken, guestToken, cashierEmail } = await seed(page.request, stamp);

  // Guest phone: the bill with the QR, amount, bank, holder and memo.
  const guest = await newPage(browser, info, baseURL ?? '');
  await guest
    .context()
    .addCookies([
      { name: 'tqr_guest', value: guestToken, url: baseURL ?? '', httpOnly: true, sameSite: 'Lax' },
    ]);
  await guest.goto(`/t/${qrToken}/hoa-don`);
  await expect(guest.getByRole('heading', { level: 1, name: 'Hoá đơn · Bàn 7' })).toBeVisible();
  const qr = guest.getByRole('img', { name: /Mã VietQR thanh toán 125\.000/ });
  await expect(qr).toBeVisible();
  await expect(qr).toHaveAttribute('src', /^data:image\/svg\+xml/);
  await expect(guest.getByText('Mở app ngân hàng và quét mã')).toBeVisible();
  await expect(guest.getByText('Vietcombank')).toBeVisible();
  await expect(guest.getByText('NGUYEN VAN ANH')).toBeVisible();
  const memo = (await guest.getByText(/^TQR [0-9A-Z]{5}$/).textContent()) ?? '';
  const code = memo.replace('TQR ', '');
  await expectNoSeriousA11yIssues(guest);

  // Cashier: the table with its code; confirm in the sheet that repeats amount and code.
  await signIn(page, cashierEmail);
  await expect(page.getByRole('heading', { name: 'Bàn 7' })).toBeVisible();
  await expect(page.getByText(`Mã ${code}`)).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Tài khoản nhận tiền vừa đổi');
  await expectNoSeriousA11yIssues(page);
  await page.getByRole('button', { name: 'Đã nhận chuyển khoản – Bàn 7' }).click();
  const sheet = page.getByRole('dialog', { name: 'Xác nhận đã nhận chuyển khoản?' });
  await expect(sheet).toContainText(`mã hoá đơn ${code}`);
  await expect(sheet).toContainText('125.000');
  await expectNoSeriousA11yIssues(page);
  await sheet.getByRole('button', { name: /Đã nhận 125\.000/ }).click();
  await expect(page.getByRole('status')).toContainText('Đã ghi nhận');

  // AC44: the guest's page turns "Đã thanh toán" by itself.
  await expect(guest.getByRole('heading', { name: 'Đã thanh toán' })).toBeVisible();
  await expectNoSeriousA11yIssues(guest);

  // AC46: closing the paid table frees it; the guest phone says goodbye.
  await page.getByRole('button', { name: 'Đóng bàn – Bàn 7' }).click();
  await page
    .getByRole('dialog', { name: 'Đóng Bàn 7?' })
    .getByRole('button', { name: 'Đóng bàn' })
    .click();
  await expect(page.getByText('Chưa có bàn nào đang phục vụ')).toBeVisible();
  await expect(guest.getByRole('heading', { name: 'Bàn đã đóng' })).toBeVisible();
  await guest.context().close();
});

// Evidence for review, not part of CI: E2E_SCREENSHOTS=1 npx playwright test billing --project=ipad
if (process.env.E2E_SCREENSHOTS) {
  test('screenshots of the bill and cashier screens', async ({ page, browser, baseURL }, info) => {
    const dir = '../docs/delivery/001-qr-table-ordering/evidence';
    const { qrToken, guestToken, cashierEmail } = await seed(
      page.request,
      `shots-${String(Date.now())}`,
    );
    const guest = await newPage(browser, info, baseURL ?? '');
    await guest
      .context()
      .addCookies([{ name: 'tqr_guest', value: guestToken, url: baseURL ?? '', httpOnly: true }]);
    await signIn(page, cashierEmail);
    for (const [width, height] of SIZES) {
      for (const scheme of ['light', 'dark'] as const) {
        for (const p of [guest, page]) {
          await p.setViewportSize({ width, height });
          await p.emulateMedia({ colorScheme: scheme });
        }
        await guest.goto(`/t/${qrToken}/hoa-don`);
        await expect(guest.getByRole('img', { name: /Mã VietQR/ })).toBeVisible();
        await guest.screenshot({
          path: `${dir}/billing-guest-${width}-${scheme}.png`,
          fullPage: true,
        });
        await page.goto('/thu-ngan');
        await expect(page.getByRole('heading', { name: 'Bàn 7' })).toBeVisible();
        await page.screenshot({
          path: `${dir}/billing-cashier-${width}-${scheme}.png`,
          fullPage: true,
        });
        await page.getByRole('button', { name: 'Đã nhận chuyển khoản – Bàn 7' }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.screenshot({ path: `${dir}/billing-confirm-${width}-${scheme}.png` });
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Đóng bàn – Bàn 7' }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.screenshot({ path: `${dir}/billing-close-${width}-${scheme}.png` });
        await page.keyboard.press('Escape');
      }
    }
    await page.getByRole('button', { name: 'Đã nhận tiền mặt – Bàn 7' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Đã nhận/ })
      .click();
    for (const [width, height] of SIZES) {
      for (const scheme of ['light', 'dark'] as const) {
        await guest.setViewportSize({ width, height });
        await guest.emulateMedia({ colorScheme: scheme });
        await guest.goto(`/t/${qrToken}/hoa-don`);
        await expect(guest.getByRole('heading', { name: 'Đã thanh toán' })).toBeVisible();
        await guest.screenshot({
          path: `${dir}/billing-paid-${width}-${scheme}.png`,
          fullPage: true,
        });
      }
    }
  });
}
