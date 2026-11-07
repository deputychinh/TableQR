import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { test, expect, type Browser, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PASSWORD = 'mat-khau-dai-123';
const STAFF_PASSWORD = 'bep-mat-khau-dai-1';

const expectNoSeriousA11yIssues = async (page: Page) => {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
  ).toEqual([]);
};

const signUpOwner = async (page: Page, email: string, name: string) => {
  await page.goto('/dang-ky');
  await page.getByLabel('Tên nhà hàng').fill(name);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Tạo nhà hàng' }).click();
  await expect(page).toHaveURL(/\/quan-ly$/);
};

const signIn = async (page: Page, email: string, password: string) => {
  await page.goto('/dang-nhap');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
};

/** A second device of the same kind (its own cookies), e.g. the owner's phone. */
const newPage = async (browser: Browser, device: Page, info: TestInfo) => {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = info.project.use;
  const context = await browser.newContext({
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    baseURL: new URL(device.url()).origin,
  });
  return context.newPage();
};

test('AC14/AC16 owner adds a kitchen user who lands on /bep; disabling sends them to sign-in', async ({
  page,
  browser,
}, info) => {
  const stamp = `${info.project.name}-${String(Date.now())}`;
  const ownerEmail = `owner-${stamp}@example.com`;
  const kitchenEmail = `bep-${stamp}@example.com`;
  await signUpOwner(page, ownerEmail, 'Bếp Nhà E2E');

  // Owner adds the kitchen user.
  await page.getByRole('link', { name: 'Nhân viên' }).click();
  await expect(page).toHaveURL(/\/quan-ly\/nhan-vien$/);
  await expect(page.getByText('Chưa có nhân viên nào')).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  await page.getByRole('link', { name: 'Thêm nhân viên' }).click();
  await page.getByLabel('Tên hiển thị').fill('Anh Bếp');
  await page.getByLabel('Email đăng nhập').fill(kitchenEmail);
  await page.getByLabel('Mật khẩu ban đầu').fill(STAFF_PASSWORD);
  await page.getByRole('radio', { name: /^Bếp/ }).check();
  // Checking the radio scrolls the submit button under the sticky bottom bar; axe's target-size
  // rule then reports that transient overlap, so the form is audited from the top of the page.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expectNoSeriousA11yIssues(page);
  await page.getByRole('button', { name: 'Thêm nhân viên' }).click();
  await expect(page).toHaveURL(/\/quan-ly\/nhan-vien$/);
  await expect(page.getByRole('status')).toContainText('Đã thêm Anh Bếp');
  await expect(page.getByRole('link', { name: /Anh Bếp/ })).toContainText('Bếp');

  // Owner signs out; the kitchen user signs in on the same device and lands on /bep.
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(/\/dang-nhap$/);
  await signIn(page, kitchenEmail, STAFF_PASSWORD);
  await expect(page).toHaveURL(/\/bep$/);
  // The kitchen screen (TQR-014); this owner has not opened the menu, so no station exists yet.
  await expect(page.getByRole('heading', { name: 'Chưa có khu bếp' })).toBeVisible();
  await expectNoSeriousA11yIssues(page);
  // A kitchen user who types an owner address is sent back to their own screen.
  await page.goto('/quan-ly/nhan-vien');
  await expect(page).toHaveURL(/\/bep$/);

  // The owner, on another device, disables the kitchen user.
  const ownerPage = await newPage(browser, page, info);
  await signIn(ownerPage, ownerEmail, PASSWORD);
  await expect(ownerPage).toHaveURL(/\/quan-ly$/);
  await ownerPage.goto('/quan-ly/nhan-vien');
  await ownerPage.getByRole('link', { name: /Anh Bếp/ }).click();
  await ownerPage.getByRole('button', { name: 'Khoá tài khoản' }).click();
  const sheet = ownerPage.getByRole('dialog', { name: 'Khoá tài khoản của Anh Bếp?' });
  await expect(sheet).toBeVisible();
  await expectNoSeriousA11yIssues(ownerPage);
  await sheet.getByRole('button', { name: 'Khoá tài khoản' }).click();
  await expect(ownerPage.getByRole('status')).toContainText('Đã khoá');
  await expect(ownerPage.getByRole('button', { name: 'Mở khoá tài khoản' })).toBeVisible();

  // The kitchen user's next request finds the session gone and goes to sign-in.
  await page.reload();
  await expect(page).toHaveURL(/\/dang-nhap\?next=(%2F|\/)bep$/);
  await signIn(page, kitchenEmail, STAFF_PASSWORD);
  await expect(page.getByRole('alert')).toContainText('Email hoặc mật khẩu không đúng.');
  await ownerPage.context().close();
});

test('AC54 platform admin suspends a restaurant: its owner cannot sign in until reactivated', async ({
  page,
  browser,
}, info) => {
  const stamp = `${info.project.name}-${String(Date.now())}`;
  const ownerEmail = `owner-s-${stamp}@example.com`;
  const restaurant = `Quán Tạm Ngưng ${stamp}`;
  const adminEmail = `admin-${stamp}@example.com`;
  const adminPassword = 'quan-tri-mat-khau-1';
  execFileSync(process.execPath, ['scripts/create-platform-admin.ts', '--email', adminEmail], {
    cwd: '../services/api',
    env: {
      ...process.env,
      TQR_DATABASE_URL:
        process.env.TQR_DATABASE_URL ?? 'postgresql://tableqr:tableqr@127.0.0.1:55432/tableqr',
      TQR_ADMIN_PASSWORD: adminPassword,
    },
  });
  await signUpOwner(page, ownerEmail, restaurant);

  const admin = await newPage(browser, page, info);
  await signIn(admin, adminEmail, adminPassword);
  await expect(admin).toHaveURL(/\/quan-tri$/);
  await expect(admin.getByText(restaurant)).toBeVisible();
  await expectNoSeriousA11yIssues(admin);
  await admin.getByRole('button', { name: `Tạm ngưng ${restaurant}` }).click();
  const sheet = admin.getByRole('dialog', { name: `Tạm ngưng ${restaurant}?` });
  await expectNoSeriousA11yIssues(admin);
  await sheet.getByRole('button', { name: 'Tạm ngưng' }).click();
  await expect(admin.getByRole('status')).toContainText(`Đã tạm ngưng ${restaurant}`);

  // The owner's session ended; sign-in explains why.
  await page.reload();
  await expect(page).toHaveURL(/\/dang-nhap/);
  await signIn(page, ownerEmail, PASSWORD);
  await expect(page.getByRole('alert')).toContainText('Nhà hàng tạm ngưng.');

  await admin.getByRole('button', { name: `Mở lại ${restaurant}` }).click();
  await admin
    .getByRole('dialog', { name: `Mở lại ${restaurant}?` })
    .getByRole('button', { name: 'Mở lại' })
    .click();
  await expect(admin.getByRole('status')).toContainText(`Đã mở lại ${restaurant}`);
  await signIn(page, ownerEmail, PASSWORD);
  await expect(page).toHaveURL(/\/quan-ly$/);
  await admin.context().close();
});
