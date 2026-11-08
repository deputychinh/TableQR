// Records the TableQR phone demo against a running app (default: the dev server on :5310).
//
// Every phone (owner, guest, kitchen) is its own iPhone-13-sized browser context. Its screen is
// captured with the Chrome DevTools screencast at device pixels (Playwright's `recordVideo` keeps
// CSS pixels, 390 px wide, too soft for a 1080×1920 video). While the script drives the app it
// writes a timeline: which phone is on screen when (segments), each narration line, and every
// sentence the kitchen screen speaks (its speech is stubbed and voiced with `say` afterwards).
// `compose.mjs` turns the timeline into the video.
//
// Usage: node scripts/demo-video/record.mjs   (env: DEMO_BASE_URL, DEMO_WORK)
import { createRequire } from 'node:module';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { narration } from './narration.mjs';
import { KITCHEN_RATE, synth } from './voice.mjs';

const webRequire = createRequire(new URL('../../web/package.json', import.meta.url));
const { chromium, devices } = webRequire('@playwright/test');

const BASE = process.env.DEMO_BASE_URL ?? 'http://localhost:5310';
const WORK = process.env.DEMO_WORK ?? join(tmpdir(), 'tableqr-demo-video');
const FRAMES = join(WORK, 'frames');
const VOICES = join(WORK, 'voices');

// Invented demo data (never real people): a new restaurant per run.
const stamp = Math.random().toString(36).slice(2, 6);
const RESTAURANT = 'Bún Chả Hương Liên';
const OWNER_EMAIL = `demo-lien-${stamp}@example.com`;
const OWNER_PASSWORD = `huong-lien-${stamp}-2026`;
const KITCHEN_EMAIL = `demo-bep-${stamp}@example.com`;
const KITCHEN_PASSWORD = `bep-huong-lien-${stamp}`;

const now = () => Date.now() / 1000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

/** Runs in every page before the app: the caption bar and the tap ripple (CSSOM only, CSP-safe). */
const overlay = () => {
  const KEY = 'demo-caption';
  // The text lives in a closed shadow root, so the app's own text queries never match it.
  let label = null;
  // Caption and taps are manual popovers: re-shown, they go above the app's modal sheets
  // (a modal <dialog> sits in the top layer, above any z-index).
  const popover = (el) => {
    el.popover = 'manual';
    Object.assign(el.style, { inset: 'auto', margin: '0', border: '0', overflow: 'visible' });
  };
  const raise = (el) => {
    if (!el.isConnected || typeof el.showPopover !== 'function') return;
    if (el.matches(':popover-open')) el.hidePopover();
    el.showPopover();
  };
  const place = (bar, pos) => {
    bar.style.top = pos === 'top' ? '70px' : 'auto';
    bar.style.bottom = pos === 'bottom' ? '100px' : 'auto';
  };
  const render = (state) => {
    const bar = document.getElementById(KEY);
    if (!bar) return;
    if (label) label.textContent = state.text;
    bar.style.opacity = state.text ? '1' : '0';
    place(bar, state.pos);
    raise(bar);
  };
  const install = () => {
    if (document.getElementById(KEY)) return;
    const bar = document.createElement('div');
    bar.id = KEY;
    bar.setAttribute('aria-hidden', 'true');
    popover(bar);
    Object.assign(bar.style, {
      position: 'fixed',
      width: 'auto',
      height: 'auto',
      left: '10px',
      right: '10px',
      zIndex: '2147483647',
      pointerEvents: 'none',
      background: 'rgba(15, 23, 42, 0.88)',
      color: '#fff',
      font: "600 18px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      textAlign: 'center',
      padding: '10px 14px',
      borderRadius: '14px',
      boxShadow: '0 6px 20px rgba(0, 0, 0, 0.3)',
      transition: 'opacity 0.2s',
      opacity: '0',
    });
    label = document.createElement('span');
    bar.attachShadow({ mode: 'closed' }).append(label);
    document.body.append(bar);
    let open = 0;
    setInterval(() => {
      const now = document.querySelectorAll('dialog[open]').length;
      if (now !== open) raise(bar);
      open = now;
    }, 100);
    try {
      render(JSON.parse(sessionStorage.getItem(KEY) ?? '{"text":"","pos":"top"}'));
    } catch {
      render({ text: '', pos: 'top' });
    }
  };
  window.__demoCaption = (text, pos) => {
    const state = { text, pos };
    try {
      sessionStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // A page without storage (about:blank) still shows the caption.
    }
    install();
    render(state);
  };
  window.__demoTap = (x, y) => {
    const dot = document.createElement('div');
    popover(dot);
    Object.assign(dot.style, {
      position: 'fixed',
      left: `${String(x - 26)}px`,
      top: `${String(y - 26)}px`,
      width: '52px',
      height: '52px',
      borderRadius: '50%',
      background: 'rgba(255, 196, 0, 0.45)',
      border: '3px solid rgba(255, 166, 0, 0.95)',
      zIndex: '2147483646',
      pointerEvents: 'none',
    });
    document.body.append(dot);
    raise(dot);
    dot
      .animate(
        [
          { transform: 'scale(0.5)', opacity: 1 },
          { transform: 'scale(1)', opacity: 1, offset: 0.4 },
          { transform: 'scale(1.5)', opacity: 0 },
        ],
        { duration: 900, easing: 'ease-out' },
      )
      .finished.then(() => dot.remove());
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
};

/**
 * Runs in the kitchen phone before the app: the browser's speech becomes a call to the recorder,
 * which voices the sentence with `say` and answers its length, so the app's queue keeps real time.
 */
const speechStub = () => {
  class Utterance {
    constructor(text) {
      this.text = text;
      this.lang = '';
      this.voice = null;
      this.rate = 1;
      this.pitch = 1;
      this.volume = 1;
      this.onend = null;
      this.onerror = null;
      this.onstart = null;
    }
  }
  let queue = Promise.resolve();
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utterance });
  Object.defineProperty(window, 'speechSynthesis', {
    value: {
      speaking: false,
      pending: false,
      paused: false,
      speak: (u) => {
        queue = queue.then(async () => {
          const seconds = u.text ? await window.__demoSpeak(u.text) : 0;
          await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
          u.onend?.(new Event('end'));
        });
      },
      cancel: () => undefined,
      pause: () => undefined,
      resume: () => undefined,
      getVoices: () => [],
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
  });
};

const timeline = { base: BASE, restaurant: RESTAURANT, segments: [], lines: [], speech: [] };
const phones = [];
let current = null;
let busyUntil = 0;
let speechUntil = 0;
const voices = {};

/** One phone: a browser context sized like an iPhone 13 screen, captured at device pixels. */
const newPhone = async (browser, name, { clock = false, speech = false } = {}) => {
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    colorScheme: 'light',
    baseURL: BASE,
  });
  await context.addInitScript(overlay);
  if (speech) {
    await context.exposeBinding('__demoSpeak', async (_source, text) => {
      const t = now();
      const voiced = await synth(text, { dir: VOICES, rate: KITCHEN_RATE });
      timeline.speech.push({ phone: name, t, text, file: voiced.file, duration: voiced.duration });
      speechUntil = Math.max(speechUntil, t) + voiced.duration;
      console.log(`  kitchen says: ${text}`);
      return voiced.duration;
    });
    await context.addInitScript(speechStub);
  }
  if (clock) await context.clock.install();
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const dir = join(FRAMES, name);
  mkdirSync(dir, { recursive: true });
  const phone = { name, context, page, dir, frames: [], writes: [] };
  phone.cdp = await context.newCDPSession(page);
  phone.cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const file = join(dir, `${String(phone.frames.length).padStart(6, '0')}.jpg`);
    phone.frames.push({ file, t: metadata.timestamp ?? now() });
    phone.writes.push(writeFile(file, Buffer.from(data, 'base64')));
    phone.cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => undefined);
  });
  await phone.cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 90,
    maxWidth: 780,
    maxHeight: 1688,
  });
  phones.push(phone);
  return phone;
};

/** Waits until the narrator has finished the current line. */
const idle = async () => sleep((busyUntil - now()) * 1000);
/** Waits until the kitchen phone has finished speaking. */
const speechIdle = async () => sleep((speechUntil - now()) * 1000 + 300);

const caption = (phone, text, pos = 'top') =>
  phone.page.evaluate(([t, p]) => window.__demoCaption?.(t, p), [text, pos]);

/** Cuts to `phone` (optionally from a moment in the past, to show what happened meanwhile). */
const show = async (phone, label, { from } = {}) => {
  await idle();
  const t = now();
  if (current) current.end = t;
  current = { phone: phone.name, label, start: from ?? t, end: null };
  timeline.segments.push(current);
  console.log(`[${label}]`);
};

/** The narrator says line `key`; the phone shows it as a caption. */
const say = async (phone, key, pos = 'top', gap = 0.45) => {
  await idle();
  const line = voices[key];
  await caption(phone, line.caption, pos);
  const t = now();
  timeline.lines.push({ phone: phone.name, t, key, ...line });
  busyUntil = t + line.duration + gap;
  console.log(`  ${key}: ${line.caption}`);
};

/** A visible tap: the ripple first, then the click a moment later, like a finger. */
const tap = async (phone, locator, after = 600) => {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (box) {
    await phone.page.evaluate(
      ([x, y]) => window.__demoTap?.(x, y),
      [box.x + box.width / 2, box.y + box.height / 2],
    );
  }
  await sleep(300);
  await locator.click();
  await sleep(after);
};

/** Types like a person, one key at a time. */
const type = async (phone, locator, text) => {
  await tap(phone, locator, 150);
  await locator.pressSequentially(text, { delay: 55 });
  await sleep(250);
};

const smoothScroll = async (locator, block = 'center') => {
  await locator.evaluate((el, b) => el.scrollIntoView({ behavior: 'smooth', block: b }), block);
  await sleep(900);
};

const nav = (phone) => phone.page.getByRole('navigation', { name: 'Điều hướng chính' });
/** Opens a destination from the bottom bar, or from its "Thêm" sheet. */
const openSection = async (phone, name) => {
  const link = nav(phone).getByRole('link', { name, exact: true });
  if (await link.isVisible()) {
    await tap(phone, link);
    return;
  }
  await tap(phone, nav(phone).getByRole('button', { name: 'Thêm' }));
  await tap(
    phone,
    phone.page
      .getByRole('dialog', { name: 'Các trang khác' })
      .getByRole('link', { name, exact: true }),
  );
};

const api = async (phone, method, path, data) => {
  const response = await phone.page.request[method](path, data ? { data } : undefined);
  if (!response.ok())
    throw new Error(`${method} ${path}: ${response.status()} ${await response.text()}`);
  return response.json();
};

/** What the guest's camera sees: the printed card of Bàn 1, then the "open" banner. */
const cameraPage = (qrSrc, href) => `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Camera</title></head>
<body style="margin:0;height:100vh;background:radial-gradient(circle at 50% 45%,#5b4a3a,#1d1712 75%);font-family:-apple-system,system-ui,sans-serif;overflow:hidden">
<div style="position:absolute;left:50%;top:46%;transform:translate(-50%,-50%) rotate(-3deg);background:#fff;border-radius:18px;padding:18px 18px 14px;width:230px;text-align:center;box-shadow:0 20px 40px rgba(0,0,0,.5)">
<div style="font-weight:700;font-size:17px;color:#111">${RESTAURANT}</div>
<img src="${qrSrc}" alt="" style="width:190px;height:190px;margin:8px auto;display:block">
<div style="font-weight:800;font-size:22px;color:#111">Bàn 1</div>
<div style="font-size:14px;color:#444">Quét mã để gọi món</div></div>
<div id="frame" style="position:absolute;left:50%;top:46%;width:270px;height:270px;transform:translate(-50%,-56%);border:4px solid #ffd60a;border-radius:22px;opacity:0;transition:opacity .3s"></div>
<a id="open" href="${href}" style="position:absolute;left:16px;right:16px;bottom:120px;display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:16px;background:rgba(255,255,255,.95);color:#111;text-decoration:none;opacity:0;transform:translateY(20px);transition:all .35s">
<span style="width:40px;height:40px;border-radius:10px;background:#117a4b;color:#fff;display:grid;place-items:center;font-weight:800">QR</span>
<span><b style="display:block;font-size:16px">Mở trang gọi món</b><span style="font-size:14px;color:#555">${RESTAURANT} · Bàn 1</span></span></a>
<div style="position:absolute;left:0;right:0;bottom:28px;text-align:center;color:#ffd60a;font-weight:600;letter-spacing:.08em">ẢNH</div>
<script>setTimeout(()=>{document.getElementById('frame').style.opacity=1},700);setTimeout(()=>{const o=document.getElementById('open');o.style.opacity=1;o.style.transform='none'},1500)</script>
</body></html>`;

const main = async () => {
  rmSync(FRAMES, { recursive: true, force: true });
  mkdirSync(FRAMES, { recursive: true });
  console.log('Voicing the narration…');
  for (const [key, line] of Object.entries(narration)) {
    voices[key] = {
      caption: line.caption,
      ...(await synth(line.speak ?? line.caption, { dir: VOICES })),
    };
  }

  const browser = await chromium.launch();
  try {
    const owner = await newPhone(browser, 'owner');
    const guest = await newPhone(browser, 'guest');
    const kitchen = await newPhone(browser, 'kitchen', { clock: true, speech: true });
    const op = owner.page;

    // 2. Sign-up → Tổng quan
    await op.goto('/dang-ky');
    await op.getByLabel('Tên nhà hàng').waitFor();
    await sleep(500);
    await show(owner, 'Chủ quán');
    await say(owner, 'signup1', 'bottom');
    await type(owner, op.getByLabel('Tên nhà hàng'), RESTAURANT);
    await type(owner, op.getByLabel('Email', { exact: true }), OWNER_EMAIL);
    await type(owner, op.getByLabel('Mật khẩu', { exact: true }), OWNER_PASSWORD);
    await idle();
    await tap(owner, op.getByRole('button', { name: 'Tạo nhà hàng' }));
    await op.waitForURL(/\/quan-ly$/);
    await say(owner, 'signup2', 'bottom');
    await sleep(1800);
    await smoothScroll(op.getByText('Bước 3', { exact: true }));

    // 3. Thực đơn: one category and one dish on camera, the rest through the API
    await say(owner, 'menu1', 'top');
    await openSection(owner, 'Thực đơn');
    await op.getByText('Chưa có món nào').waitFor();
    await sleep(600);
    await tap(owner, op.getByRole('button', { name: 'Thêm món đầu tiên' }));
    const group = op.getByRole('dialog', { name: 'Thêm nhóm món' });
    await type(owner, group.getByLabel('Tên nhóm'), 'Món chính');
    await tap(owner, group.getByRole('switch', { name: 'Đây là nhóm món chính' }));
    await tap(owner, group.getByRole('button', { name: 'Lưu' }));
    const dish = op.getByRole('dialog', { name: 'Thêm món' });
    await say(owner, 'menu2', 'top');
    await type(owner, dish.getByLabel('Tên món'), 'Bún chả');
    await type(owner, dish.getByLabel('Giá bán'), '45000');
    await tap(owner, dish.getByRole('button', { name: 'Lưu' }));
    await dish.waitFor({ state: 'hidden' });
    const menu = await api(owner, 'get', '/api/menu');
    const stationId = menu.stations[0].id;
    const main = menu.categories.find((c) => c.name === 'Món chính');
    const drinks = await api(owner, 'post', '/api/menu/categories', {
      name: 'Đồ uống',
      isMain: false,
    });
    for (const [name, priceVnd, categoryId] of [
      ['Phở bò', 50_000, main.id],
      ['Nem rán', 35_000, main.id],
      ['Trà đá', 5_000, drinks.id],
    ]) {
      await api(owner, 'post', '/api/menu/items', { name, priceVnd, categoryId, stationId });
    }
    await say(owner, 'menu3', 'top');
    await op.reload();
    await op.getByText('Trà đá').waitFor();
    await sleep(700);
    await smoothScroll(op.getByText('Trà đá'));
    await sleep(800);

    // 4. Bàn & QR, print sheet
    await say(owner, 'tables1', 'top');
    await openSection(owner, 'Bàn & QR');
    await tap(owner, op.getByRole('button', { name: 'Thêm bàn đầu tiên' }));
    for (const [i, name] of ['Bàn 1', 'Bàn 2'].entries()) {
      if (i > 0) await tap(owner, op.getByRole('button', { name: 'Thêm bàn', exact: true }));
      const dialog = op.getByRole('dialog', { name: 'Thêm bàn' });
      await type(owner, dialog.getByLabel('Tên bàn'), name);
      await tap(owner, dialog.getByRole('button', { name: 'Thêm bàn' }));
      await op
        .getByRole('status')
        .filter({ hasText: `Đã thêm ${name}` })
        .waitFor();
    }
    await sleep(800);
    await say(owner, 'tables2', 'bottom');
    await tap(owner, op.getByRole('button', { name: 'In tất cả mã QR' }), 900);
    const sheet = op.getByRole('region', { name: 'Trang in mã QR' });
    await sheet.getByRole('article').first().waitFor();
    const qrSrc = await sheet
      .getByRole('article')
      .first()
      .getByRole('img')
      .first()
      .getAttribute('src');
    await sleep(1200);
    await smoothScroll(sheet.getByRole('article').nth(1));
    const tables = await api(owner, 'get', '/api/tables');
    const table1 = tables.items.find((t) => t.name === 'Bàn 1');

    // 5. Cài đặt: the reminder after 10 minutes, QR transfer off
    await sleep(800);
    await tap(owner, op.getByRole('link', { name: 'Quay lại danh sách bàn' }));
    await say(owner, 'settings1', 'bottom');
    await openSection(owner, 'Cài đặt');
    await op.getByRole('heading', { name: 'Cài đặt quán', level: 1 }).waitFor();
    await sleep(500);
    await smoothScroll(op.getByRole('heading', { name: 'Nhắc món chờ lâu' }), 'start');
    await smoothScroll(op.getByRole('radio', { name: /10 phút/ }).first());
    await say(owner, 'settings2', 'top');
    await smoothScroll(op.getByRole('switch', { name: 'Cho khách chuyển khoản bằng mã QR' }));
    await sleep(1000);

    // 6. A kitchen account
    await say(owner, 'staff1', 'bottom');
    await openSection(owner, 'Nhân viên');
    await tap(owner, op.getByRole('link', { name: 'Thêm nhân viên' }));
    await type(owner, op.getByLabel('Tên hiển thị'), 'Anh Tùng bếp');
    await type(owner, op.getByLabel('Email đăng nhập'), KITCHEN_EMAIL);
    await type(owner, op.getByLabel('Mật khẩu ban đầu'), KITCHEN_PASSWORD);
    await tap(owner, op.getByRole('radio', { name: /^Bếp/ }));
    await tap(owner, op.getByRole('button', { name: 'Thêm nhân viên' }));
    await op.getByRole('status').filter({ hasText: 'Đã thêm Anh Tùng bếp' }).waitFor();
    await sleep(1200);

    // 8a. The kitchen phone signs in and turns the voice on (before any order comes in)
    const kp = kitchen.page;
    await kp.goto('/dang-nhap');
    await kp.getByLabel('Email', { exact: true }).waitFor();
    await sleep(400);
    await show(kitchen, 'Bếp');
    await say(kitchen, 'kitchen1', 'bottom');
    await type(kitchen, kp.getByLabel('Email', { exact: true }), KITCHEN_EMAIL);
    await type(kitchen, kp.getByLabel('Mật khẩu', { exact: true }), KITCHEN_PASSWORD);
    await tap(kitchen, kp.getByRole('button', { name: 'Đăng nhập' }));
    await kp.waitForURL(/\/bep$/);
    await kp.getByText('Chưa có món nào cần làm').waitFor();
    await say(kitchen, 'kitchen2', 'bottom');
    await idle();
    await tap(kitchen, kp.getByRole('switch', { name: 'Bật đọc to' }));
    await sleep(600);
    await speechIdle();
    // Shown later, when the video cuts back to the kitchen as the order arrives.
    await caption(kitchen, 'Trong bếp: món mới tự hiện lên và được đọc to', 'bottom');

    // When the order arrives (while the guest is on screen) the kitchen scrolls to its tickets,
    // so the cut back to the kitchen shows them.
    const kitchenFollows = (async () => {
      await kp
        .getByRole('article', { name: 'Bàn 1 · 2 khách' })
        .first()
        .waitFor({ timeout: 120_000 });
      await sleep(900);
      await smoothScroll(kp.getByRole('region', { name: /^Đang chờ/ }), 'start');
    })();

    // 7. The guest scans Bàn 1 and orders
    const gp = guest.page;
    await gp.route('**/__demo/camera', (route) =>
      route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: cameraPage(qrSrc, `/t/${table1.qrToken}`),
      }),
    );
    await gp.goto('/__demo/camera');
    await show(guest, 'Khách ở Bàn 1');
    await say(guest, 'guest1', 'top');
    await sleep(1800);
    await idle();
    await tap(guest, gp.locator('#open'));
    await gp.getByRole('button', { name: 'Bắt đầu gọi món' }).waitFor();
    await say(guest, 'guest2', 'bottom');
    await sleep(1200);
    await tap(guest, gp.getByRole('button', { name: 'Thêm một người' }));
    await tap(guest, gp.getByRole('button', { name: 'Bớt một người' }));
    await idle();
    await tap(guest, gp.getByRole('button', { name: 'Bắt đầu gọi món' }));
    await gp.getByRole('heading', { level: 1, name: 'Thực đơn' }).waitFor();
    await say(guest, 'guest3', 'top');
    await tap(guest, gp.getByRole('button', { name: 'Thêm một Phở bò' }));
    await tap(guest, gp.getByRole('button', { name: 'Thêm một Phở bò' }));
    await tap(guest, gp.getByRole('button', { name: 'Thêm một Trà đá' }));
    await tap(guest, gp.getByRole('button', { name: 'Giỏ hàng (3)' }), 900);
    await idle();
    const sent = now();
    await tap(
      guest,
      gp.getByRole('dialog', { name: 'Giỏ hàng' }).getByRole('button', { name: 'Gửi món' }),
    );
    await gp.getByRole('heading', { level: 1, name: 'Món đã gọi' }).waitFor();
    await say(guest, 'guest4', 'bottom');

    // 8b. Meanwhile in the kitchen: the order appears and is read aloud
    await show(kitchen, 'Bếp', { from: sent - 0.6 });
    await kitchenFollows;
    await speechIdle();
    await say(kitchen, 'kitchen3', 'bottom');

    // 9. Ten minutes later: the reminder
    await say(kitchen, 'later', 'bottom', 0.2);
    await idle();
    await kp.clock.fastForward('10:30');
    const deadline = Date.now() + 15_000;
    while (!timeline.speech.some((s) => s.text.includes('10 phút')) && Date.now() < deadline)
      await sleep(200);
    await sleep(500);
    await speechIdle();
    await kp.getByText('Trễ 10 phút').first().waitFor();
    await say(kitchen, 'kitchen4', 'bottom');
    await sleep(1500);

    // 10. Cook, serve, the guest sees "Đã ra bàn"
    await say(kitchen, 'cook1', 'bottom');
    const waiting = kp.getByRole('region', { name: /^Đang chờ/ });
    const cooking = kp.getByRole('region', { name: /^Đang nấu/ });
    while ((await waiting.getByRole('button', { name: 'Bắt đầu nấu' }).count()) > 0) {
      await tap(kitchen, waiting.getByRole('button', { name: 'Bắt đầu nấu' }).first(), 900);
      await tap(kitchen, cooking.getByRole('button', { name: 'Xong' }).first(), 900);
    }
    await kp.getByText('Chưa có món nào cần làm').waitFor();
    await sleep(800);

    await op.goto('/quan-ly');
    await sleep(600);
    await show(owner, 'Phục vụ (chủ quán)');
    await say(owner, 'serve1', 'top');
    await openSection(owner, 'Phục vụ');
    const ready = op.getByRole('article', { name: 'Bàn 1 · 2 khách' });
    await ready.first().waitFor();
    await sleep(800);
    await caption(guest, voices.serve2.caption, 'bottom');
    await idle();
    const served = now();
    const serveButtons = op.getByRole('button', { name: 'Đã ra bàn', exact: true });
    while ((await serveButtons.count()) > 0) {
      await tap(owner, serveButtons.first(), 1000);
    }
    await sleep(1000);
    await show(guest, 'Khách ở Bàn 1', { from: served - 0.6 });
    await gp.getByText('Đã ra bàn', { exact: true }).first().waitFor();
    await say(guest, 'serve2', 'bottom');

    // 11. The bill: pay at the counter, the cashier confirms, the guest sees "Đã thanh toán"
    await say(guest, 'pay1', 'bottom');
    await tap(guest, gp.getByRole('button', { name: 'Xem hoá đơn / Thanh toán' }));
    await gp.getByRole('heading', { name: 'Thanh toán tại quầy' }).waitFor();
    await sleep(1500);
    await caption(guest, voices.pay3.caption, 'bottom');
    await op.goto('/quan-ly');
    await sleep(500);
    await show(owner, 'Thu ngân (chủ quán)');
    await say(owner, 'pay2', 'top');
    await openSection(owner, 'Thu ngân');
    await tap(owner, op.getByRole('button', { name: 'Đã nhận tiền – Bàn 1', exact: true }));
    const confirm = op.getByRole('dialog', { name: 'Xác nhận đã nhận tiền?' });
    await idle();
    const paid = now();
    await tap(owner, confirm.getByRole('button', { name: /Đã nhận 105\.000/ }));
    await op.getByRole('status').filter({ hasText: 'Đã ghi nhận' }).first().waitFor();
    await sleep(900);
    await show(guest, 'Khách ở Bàn 1', { from: paid - 0.6 });
    await gp.getByRole('heading', { name: 'Đã thanh toán' }).waitFor();
    await say(guest, 'pay3', 'bottom');
    await idle();
    await sleep(800);
    current.end = now();
  } catch (error) {
    for (const phone of phones) {
      await phone.page
        .screenshot({ path: join(WORK, `failed-${phone.name}.png`) })
        .catch(() => undefined);
    }
    throw error;
  } finally {
    for (const phone of phones) {
      await phone.cdp.send('Page.stopScreencast').catch(() => undefined);
      await Promise.all(phone.writes);
      timeline[`frames_${phone.name}`] = phone.frames;
    }
    await browser.close();
  }
  timeline.outro = voices.outro;
  timeline.intro = voices.intro;
  writeFileSync(join(WORK, 'timeline.json'), JSON.stringify(timeline, null, 1));
  console.log(
    `Timeline: ${join(WORK, 'timeline.json')} (restaurant ${RESTAURANT}, ${OWNER_EMAIL})`,
  );
};

await main();
