import process from 'node:process';
import { test, expect, type Locator, type Page, type TestInfo } from './support/fixtures.js';
import AxeBuilder from '@axe-core/playwright';
import { sql } from './support/db.js';

const expectNoSeriousA11yIssues = async (page: Page) => {
  // axe's target-size rule counts a button scrolled under the sticky bottom nav as "obscured";
  // at the end of the page the nav sits in its own row and covers nothing, so check there.
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
  ).toEqual([]);
};

const addTable = async (page: Page, name: string, extraSeats: number) => {
  const dialog = page.getByRole('dialog', { name: 'Thêm bàn' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Tên bàn').fill(name);
  for (let i = 0; i < extraSeats; i += 1) {
    await dialog.getByRole('button', { name: 'Thêm một chỗ' }).click();
  }
  await dialog.getByRole('button', { name: 'Thêm bàn' }).click();
  await expect(page.getByRole('status')).toContainText(`Đã thêm ${name}`);
};

test('owner adds tables, prints the QR sheet, regenerates a code and the old code expires', async ({
  page,
}, info) => {
  await page.goto('/dang-ky');
  await page.getByLabel('Tên nhà hàng').fill('Lẩu Nấm E2E');
  await page
    .getByLabel('Email', { exact: true })
    .fill(`tables-${info.project.name}-${Date.now()}@example.com`);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('mat-khau-dai-123');
  await page.getByRole('button', { name: 'Tạo nhà hàng' }).click();
  await expect(page).toHaveURL(/\/quan-ly$/);

  // Empty state → first table
  await page.getByRole('link', { name: 'Bàn & QR' }).click();
  await expect(page.getByRole('heading', { name: 'Chưa có bàn nào' })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await page.getByRole('button', { name: 'Thêm bàn đầu tiên' }).click();
  await expectNoSeriousA11yIssues(page);
  await addTable(page, 'Bàn 1', 0);
  await page.getByRole('button', { name: 'Thêm bàn', exact: true }).click();
  await addTable(page, 'Bàn 2', 2);

  // AC8: each table shows its own QR code that opens the guest page
  await expect(page.getByRole('img', { name: 'Mã QR của Bàn 1' })).toHaveAttribute(
    'src',
    /^data:image\/svg\+xml/,
  );
  await expect(page.getByRole('img', { name: 'Mã QR của Bàn 2' })).toHaveAttribute(
    'src',
    /^data:image\/svg\+xml/,
  );
  await expect(page.getByText('6 chỗ ngồi')).toBeVisible();
  const oldUrl = await page
    .getByRole('link', { name: 'Xem trang khách của Bàn 1' })
    .getAttribute('href');
  expect(oldUrl).toMatch(/\/t\/[A-Za-z0-9_-]{22}$/);
  await expectNoSeriousA11yIssues(page);

  // AC9: the print sheet has one card per table with QR, names and the scan line
  await page.getByRole('button', { name: 'In tất cả mã QR' }).click();
  await expect(page).toHaveURL(/\/quan-ly\/ban\/in$/);
  const sheet = page.getByRole('region', { name: 'Trang in mã QR' });
  await expect(sheet.getByRole('article')).toHaveCount(2);
  await expect(sheet.getByText('Lẩu Nấm E2E')).toHaveCount(2);
  await expect(sheet.getByText('Quét mã để gọi món')).toHaveCount(2);
  await expectNoSeriousA11yIssues(page);
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('button', { name: 'In ngay' })).toBeHidden();
  await expect(page.getByRole('link', { name: 'Quay lại danh sách bàn' })).toBeHidden();
  await expect(sheet.getByRole('article').first()).toHaveCSS('break-inside', 'avoid');
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('link', { name: 'Quay lại danh sách bàn' }).click();

  // The guest page before rotation
  const guest = await page.context().newPage();
  await guest.goto(oldUrl ?? '');
  await expect(guest.getByRole('heading', { name: 'Chào mừng bạn đến Lẩu Nấm E2E' })).toBeVisible();
  await expect(guest.getByRole('button', { name: 'Bắt đầu gọi món' })).toBeVisible();
  await expectNoSeriousA11yIssues(guest);

  // AC10: regenerate → the old code shows "Mã QR đã hết hạn", the new one works
  await page.getByRole('button', { name: 'Đổi mã QR của Bàn 1' }).click();
  await expectNoSeriousA11yIssues(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Đổi mã QR' }).click();
  await expect(page.getByRole('status')).toContainText('Đã đổi mã QR của Bàn 1');
  const qrLink = page.getByRole('link', { name: 'Xem trang khách của Bàn 1' });
  await expect(qrLink).not.toHaveAttribute('href', oldUrl ?? '');
  const newUrl = await qrLink.getAttribute('href');

  await guest.reload();
  await expect(guest.getByRole('heading', { level: 1, name: 'Mã QR đã hết hạn' })).toBeVisible();
  await expectNoSeriousA11yIssues(guest);
  await guest.goto(newUrl ?? '');
  await expect(guest.getByRole('button', { name: 'Bắt đầu gọi món' })).toBeVisible();

  // AC11: an unknown code
  await guest.goto('/t/AAAAAAAAAAAAAAAAAAAAAA');
  await expect(guest.getByRole('heading', { level: 1, name: 'Không tìm thấy bàn' })).toBeVisible();
  await expectNoSeriousA11yIssues(guest);
});

test('a table with a paid bill cannot be deleted; a table without history can (TQR-007 review)', async ({
  page,
}, info) => {
  await page.goto('/dang-ky');
  await page.getByLabel('Tên nhà hàng').fill('Quán Giữ Lịch Sử Thu Tiền Của Bàn Ăn Phố Cổ');
  const email = `keep-${info.project.name}-${Date.now()}@example.com`;
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('mat-khau-dai-123');
  await page.getByRole('button', { name: 'Tạo nhà hàng' }).click();
  await expect(page).toHaveURL(/\/quan-ly$/);
  await page.goto('/quan-ly/ban');
  await page.getByRole('button', { name: 'Thêm bàn đầu tiên' }).click();
  await addTable(page, 'Bàn 1', 0);
  await page.getByRole('button', { name: 'Thêm bàn', exact: true }).click();
  await addTable(page, 'Bàn 2', 0);

  // Bàn 1 served a party that paid (closed session + paid bill).
  sql(`
    with t as (
      select d.id, d.restaurant_id from dining_tables d
        join users u on u.restaurant_id = d.restaurant_id
      where u.email = '${email}' and d.name = 'Bàn 1'
    ), s as (
      insert into table_sessions (restaurant_id, table_id, party_size, opened_by, status, closed_at)
      select restaurant_id, id, 2, 'staff', 'closed', now() from t returning id, restaurant_id
    )
    insert into bills (restaurant_id, session_id, code, amount_vnd, status, paid_at, method)
    select restaurant_id, id, 'KEEP1', 150000, 'paid', now(), 'cash' from s;
  `);
  const paidBills = () =>
    sql(`select count(*) from bills b join users u on u.restaurant_id = b.restaurant_id
         where u.email = '${email}' and b.status = 'paid'`);
  expect(paidBills()).toBe('1');

  await page.getByRole('button', { name: 'Xoá Bàn 1' }).click();
  await page
    .getByRole('dialog', { name: 'Xoá Bàn 1?' })
    .getByRole('button', { name: 'Xoá bàn' })
    .click();
  const refused = page.getByRole('dialog', { name: 'Không xoá được Bàn 1' });
  await expect(refused).toContainText('giữ lịch sử thu tiền');
  await expectNoSeriousA11yIssues(page);
  await refused.getByRole('button', { name: 'Đóng' }).click();
  await expect(page.getByRole('heading', { name: 'Bàn 1' })).toBeVisible();
  expect(paidBills()).toBe('1');

  await page.getByRole('button', { name: 'Xoá Bàn 2' }).click();
  await page
    .getByRole('dialog', { name: 'Xoá Bàn 2?' })
    .getByRole('button', { name: 'Xoá bàn' })
    .click();
  await expect(page.getByRole('status')).toContainText('Đã xoá Bàn 2.');
  await expect(page.getByRole('heading', { name: 'Bàn 2' })).toHaveCount(0);
});

const EVIDENCE = '../docs/delivery/001-qr-table-ordering/evidence';
/** 390 px evidence, light and dark (iPhone project) when `E2E_SCREENSHOTS=1`; never asserted. */
const evidence = async (page: Page, info: TestInfo, name: string, show: Locator) => {
  if (!process.env.E2E_SCREENSHOTS || info.project.name !== 'iphone') return;
  // The shell scrolls its content area, so a full-page shot would cut it: bring `show` up instead.
  await show.evaluate((el) => {
    el.scrollIntoView({ block: 'start' });
  });
  await page.mouse.move(0, 0);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
    await page.screenshot({ path: `${EVIDENCE}/${name}-390-${scheme}.png` });
  }
  await page.emulateMedia({ colorScheme: 'light' });
};

test('TQR-024 a table with history is hidden ("Ẩn bàn"): not listed, not printed, its QR says "Không tìm thấy bàn"; "Hiện lại" brings it back', async ({
  page,
  browser,
}, info) => {
  await page.goto('/dang-ky');
  await page.getByLabel('Tên nhà hàng').fill('Quán Ẩn Bàn');
  const email = `archive-${info.project.name}-${Date.now()}@example.com`;
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('mat-khau-dai-123');
  await page.getByRole('button', { name: 'Tạo nhà hàng' }).click();
  await expect(page).toHaveURL(/\/quan-ly$/);
  await page.goto('/quan-ly/ban');
  await page.getByRole('button', { name: 'Thêm bàn đầu tiên' }).click();
  await addTable(page, 'Bàn sân', 0);
  await page.getByRole('button', { name: 'Thêm bàn', exact: true }).click();
  await addTable(page, 'Bàn 2', 0);
  sql(`
    with t as (
      select d.id, d.restaurant_id from dining_tables d
        join users u on u.restaurant_id = d.restaurant_id
      where u.email = '${email}' and d.name = 'Bàn sân'
    ), s as (
      insert into table_sessions (restaurant_id, table_id, party_size, opened_by, status, closed_at)
      select restaurant_id, id, 2, 'staff', 'closed', now() from t returning id, restaurant_id
    )
    insert into bills (restaurant_id, session_id, code, amount_vnd, status, paid_at, method)
    select restaurant_id, id, 'HDE12', 150000, 'paid', now(), 'cash' from s;
  `);
  const qrToken = sql(`select d.qr_token from dining_tables d join users u
    on u.restaurant_id = d.restaurant_id where u.email = '${email}' and d.name = 'Bàn sân'`);

  // Delete is refused; the sheet's primary action hides the table instead.
  await page.getByRole('button', { name: 'Xoá Bàn sân' }).click();
  await page
    .getByRole('dialog', { name: 'Xoá Bàn sân?' })
    .getByRole('button', { name: 'Xoá bàn' })
    .click();
  const refused = page.getByRole('dialog', { name: 'Không xoá được Bàn sân' });
  await expect(refused).toContainText('Bạn có thể ẩn bàn');
  await refused.getByRole('button', { name: 'Ẩn bàn' }).click();
  await expect(page.getByRole('status')).toContainText('Đã ẩn Bàn sân.');
  await expect(page.getByRole('heading', { name: 'Bàn sân' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Đóng thông báo' }).click();
  const toggle = page.getByRole('button', { name: 'Bàn đã ẩn (1)' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(page.getByRole('button', { name: 'Hiện lại Bàn sân' })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await evidence(page, info, 'tables-archived', page.locator('.tables-page__archived'));
  const paid = sql(`select count(*) from bills b join users u on u.restaurant_id = b.restaurant_id
    where u.email = '${email}' and b.status = 'paid'`);
  expect(paid).toBe('1');

  // Not printable: the print sheet has Bàn 2 only.
  await page.getByRole('button', { name: 'In tất cả mã QR' }).click();
  const sheet = page.getByRole('region', { name: 'Trang in mã QR' });
  await expect(sheet.getByRole('heading')).toHaveText(['Bàn 2']);

  // A guest scanning its code is told the table does not exist.
  const guest = await browser.newPage({ baseURL: new URL(page.url()).origin });
  await guest.goto(`/t/${qrToken}`);
  await expect(guest.getByRole('heading', { name: 'Không tìm thấy bàn' })).toBeVisible();

  // "Hiện lại": listed again and the same sticker works.
  await page.goto('/quan-ly/ban');
  await page.getByRole('button', { name: 'Bàn đã ẩn (1)' }).click();
  await page.getByRole('button', { name: 'Hiện lại Bàn sân' }).click();
  await expect(page.getByRole('status')).toContainText('Đã hiện lại Bàn sân.');
  await expect(page.getByRole('heading', { name: 'Bàn sân' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Bàn đã ẩn/ })).toHaveCount(0);
  await guest.reload();
  await expect(guest.getByText('Bàn sân').first()).toBeVisible();
  await expect(guest.getByRole('heading', { name: 'Không tìm thấy bàn' })).toHaveCount(0);
  await guest.close();
});
