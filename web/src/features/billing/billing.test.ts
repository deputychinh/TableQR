import { screen, within } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { fakeApi } from '@/test/fake-api';
import { renderWithApp } from '@/test/render';
import GuestBill from './components/GuestBill.vue';
import CashierPage from './pages/CashierPage.vue';
import GuestBillPage from './pages/GuestBillPage.vue';
import { billChanged, shortDateTime } from './bill-state';
import type { Bill, CashierOverview, CashierSession, SessionBill } from './api';

/** EventSource stand-in: records listeners so a test can push snapshot/delta events. */
class FakeEventSource {
  static last: FakeEventSource | undefined;
  readonly listeners = new Map<string, ((event: Event) => void)[]>();
  constructor(readonly url: string) {
    FakeEventSource.last = this;
  }
  addEventListener(type: string, listener: (event: Event) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: string, data: unknown) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new MessageEvent(type, { data: JSON.stringify(data) }));
    }
  }
  close() {}
}

const bill = (patch: Partial<Bill> = {}): Bill => ({
  id: 'b1',
  code: '7F3K2',
  memo: 'TQR 7F3K2',
  amountVnd: 115_000,
  status: 'open',
  createdAt: '2026-11-08T05:00:00.000Z',
  paidAt: null,
  method: null,
  ...patch,
});

const view = (patch: Partial<SessionBill> = {}): SessionBill => ({
  restaurantName: 'Phở Hà Nội',
  session: { id: 's1', tableName: 'Bàn 3', status: 'open' },
  lines: [
    { id: 'i1', name: 'Phở bò', quantity: 2, priceVnd: 50_000, lineTotalVnd: 100_000 },
    { id: 'i2', name: 'Trà đá', quantity: 3, priceVnd: 5_000, lineTotalVnd: 15_000 },
  ],
  totalVnd: 115_000,
  paidVnd: 0,
  dueVnd: 115_000,
  bill: bill(),
  transfer: {
    payload: '00020101021238540010A0000007270124000697043601100123456789',
    bankName: 'Vietcombank',
    accountNumber: '0123456789',
    accountName: 'NGUYEN VAN ANH',
  },
  payAtCounter: false,
  ...patch,
});

beforeEach(() => {
  vi.stubGlobal('EventSource', FakeEventSource);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('billChanged (AC42)', () => {
  it('is true when the shown open code was replaced or superseded, false otherwise', () => {
    const before = view();
    expect(billChanged(undefined, before)).toBe(false);
    expect(billChanged(before, view())).toBe(false);
    expect(billChanged(before, view({ bill: bill({ id: 'b2', code: 'ABCDE' }) }))).toBe(true);
    expect(billChanged(before, view({ bill: bill({ status: 'superseded' }) }))).toBe(true);
    expect(billChanged(before, view({ bill: null }))).toBe(true);
    expect(billChanged(before, view({ bill: bill({ id: 'b2', status: 'paid' }) }))).toBe(false);
    expect(billChanged(view({ bill: bill({ status: 'paid' }) }), view())).toBe(false);
  });

  it('formats short dates and leaves null empty', () => {
    expect(shortDateTime(null)).toBe('');
    expect(shortDateTime('2026-11-08T05:00:00.000Z')).toMatch(/^\d{2}:\d{2}\u00a0\d{2}\/\d{2}$/);
  });
});

describe('GuestBill', () => {
  it('AC40: shows the amount large, the VietQR, bank, holder, account, memo and scan hint', async () => {
    await renderWithApp(GuestBill, { props: { bill: view() } });
    expect(screen.getByRole('heading', { level: 1, name: 'Hoá đơn · Bàn 3' })).toBeTruthy();
    expect(screen.getAllByText('115.000 ₫').length).toBeGreaterThan(0);
    expect(screen.getByRole('img', { name: 'Mã VietQR thanh toán 115.000\u00a0₫' })).toBeTruthy();
    expect(screen.getByText('Mở app ngân hàng và quét mã')).toBeTruthy();
    expect(screen.getByText('Vietcombank')).toBeTruthy();
    expect(screen.getByText('NGUYEN VAN ANH')).toBeTruthy();
    expect(screen.getByText('0123456789')).toBeTruthy();
    expect(screen.getByText('TQR 7F3K2')).toBeTruthy();
    expect(screen.getByText('Chờ thanh toán')).toBeTruthy();
    expect(screen.getByText('Phở bò')).toBeTruthy();
    expect(screen.getByText('2 ×')).toBeTruthy();
  });

  it('AC41: without a bank account it says pay at the counter and shows the code', async () => {
    await renderWithApp(GuestBill, {
      props: { bill: view({ transfer: null, payAtCounter: true }) },
    });
    expect(screen.getByRole('heading', { name: 'Thanh toán tại quầy' })).toBeTruthy();
    expect(screen.getByText('7F3K2')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('AC42: tells the guest the bill changed', async () => {
    await renderWithApp(GuestBill, { props: { bill: view(), changed: true } });
    expect(screen.getByRole('status').textContent).toContain('Hoá đơn đã thay đổi');
  });

  it('AC42: says so when the old code is gone and nothing is left to pay', async () => {
    await renderWithApp(GuestBill, {
      props: { bill: view({ bill: bill({ status: 'superseded' }), dueVnd: 0 }), changed: true },
    });
    expect(screen.getByRole('status').textContent).toContain('không còn món cần thanh toán');
  });

  it('AC44: shows "Đã thanh toán" once paid, with the amount and earlier payments', async () => {
    await renderWithApp(GuestBill, {
      props: {
        bill: view({
          bill: bill({ status: 'paid', method: 'transfer', paidAt: '2026-11-08T06:00:00Z' }),
          paidVnd: 115_000,
          dueVnd: 0,
          transfer: null,
        }),
      },
    });
    expect(screen.getByRole('heading', { name: 'Đã thanh toán' })).toBeTruthy();
    expect(screen.getByText('Cảm ơn bạn! Quán đã nhận 115.000 ₫.')).toBeTruthy();
    expect(screen.getByText('Đã trả')).toBeTruthy();
  });
});

describe('GuestBillPage', () => {
  it('requests the bill, then turns "Đã thanh toán" when the stream says so', async () => {
    let paid = false;
    fakeApi({
      'POST /api/g/bill': { body: view() },
      'GET /api/g/bill': () =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              paid
                ? view({
                    bill: bill({ status: 'paid', method: 'cash' }),
                    paidVnd: 115_000,
                    dueVnd: 0,
                  })
                : view(),
            ),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        ),
    });
    await renderWithApp(GuestBillPage, {
      paths: ['/t/:qrToken/hoa-don', '/t/:qrToken'],
      at: '/t/abc/hoa-don',
    });
    expect(await screen.findByText('TQR 7F3K2')).toBeTruthy();
    expect(FakeEventSource.last?.url).toBe('/api/g/bill/stream');
    paid = true;
    FakeEventSource.last?.emit('delta', { type: 'bill.status', status: 'paid' });
    expect(await screen.findByRole('heading', { name: 'Đã thanh toán' })).toBeTruthy();
  });

  it('shows the new code and the change notice after a snapshot with another bill', async () => {
    fakeApi({ 'POST /api/g/bill': { body: view() } });
    await renderWithApp(GuestBillPage, { paths: ['/t/:qrToken/hoa-don'], at: '/t/abc/hoa-don' });
    await screen.findByText('TQR 7F3K2');
    FakeEventSource.last?.emit(
      'snapshot',
      view({ bill: bill({ id: 'b2', code: 'ABCDE', memo: 'TQR ABCDE', amountVnd: 145_000 }) }),
    );
    expect(await screen.findByText('TQR ABCDE')).toBeTruthy();
    expect(screen.getByText(/Hoá đơn đã thay đổi vì có thêm món/)).toBeTruthy();
  });

  it('asks a phone without a table session to scan the QR', async () => {
    fakeApi({ 'POST /api/g/bill': { status: 401, body: { code: 'GUEST_SESSION_REQUIRED' } } });
    await renderWithApp(GuestBillPage, {
      paths: ['/t/:qrToken/hoa-don', '/t/:qrToken'],
      at: '/t/abc/hoa-don',
    });
    expect(await screen.findByRole('heading', { name: 'Bạn chưa vào bàn' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Về trang gọi món' }).getAttribute('href')).toBe(
      '/t/abc',
    );
  });

  it('says thanks when the cashier closed the table', async () => {
    fakeApi({
      'POST /api/g/bill': { body: view() },
      'GET /api/g/bill': { status: 401, body: { code: 'GUEST_SESSION_REQUIRED' } },
    });
    await renderWithApp(GuestBillPage, { paths: ['/t/:qrToken/hoa-don'], at: '/t/abc/hoa-don' });
    await screen.findByText('TQR 7F3K2');
    FakeEventSource.last?.emit('delta', { type: 'session.status', status: 'closed' });
    expect(await screen.findByRole('heading', { name: 'Bàn đã đóng' })).toBeTruthy();
  });

  it('shows an empty state with nothing ordered, and an error with retry', async () => {
    fakeApi({
      'POST /api/g/bill': {
        body: view({ lines: [], bill: null, totalVnd: 0, dueVnd: 0, transfer: null }),
      },
    });
    await renderWithApp(GuestBillPage, {
      paths: ['/t/:qrToken/hoa-don', '/t/:qrToken'],
      at: '/t/abc/hoa-don',
    });
    expect(await screen.findByText('Chưa có món nào để thanh toán')).toBeTruthy();
    vi.unstubAllGlobals();
    vi.stubGlobal('EventSource', FakeEventSource);
    fakeApi({ 'POST /api/g/bill': { status: 500, body: { code: 'INTERNAL' } } });
    await renderWithApp(GuestBillPage, { paths: ['/t/:qrToken/hoa-don'], at: '/t/abc/hoa-don' });
    expect(await screen.findByRole('button', { name: 'Thử lại' })).toBeTruthy();
  });
});

const session = (patch: Partial<CashierSession> = {}): CashierSession => ({
  sessionId: 's1',
  tableName: 'Bàn 3',
  partySize: 4,
  openedAt: '2026-11-08T04:00:00.000Z',
  totalVnd: 115_000,
  paidVnd: 0,
  dueVnd: 115_000,
  bill: { ...bill(), paidByName: null },
  ...patch,
});

const overview = (patch: Partial<CashierOverview> = {}): CashierOverview => ({
  sessions: [session()],
  bankConfigured: true,
  bankChangedAt: null,
  bankChangedRecently: false,
  ...patch,
});

describe('CashierPage', () => {
  it('AC44: confirms a transfer in a sheet that repeats amount and code', async () => {
    let paid = false;
    const calls = fakeApi({
      'GET /api/bills/overview': () =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              paid
                ? overview({
                    sessions: [
                      session({
                        paidVnd: 115_000,
                        dueVnd: 0,
                        bill: {
                          ...bill({
                            status: 'paid',
                            method: 'transfer',
                            paidAt: '2026-11-08T06:00:00Z',
                          }),
                          paidByName: 'Lan',
                        },
                      }),
                    ],
                  })
                : overview(),
            ),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        ),
      'POST /api/bills/b1/pay': () => {
        paid = true;
        return Promise.resolve(new Response(JSON.stringify(view()), { status: 200 }));
      },
    });
    await renderWithApp(CashierPage, { paths: ['/dang-nhap'] });
    expect(await screen.findByRole('heading', { name: 'Bàn 3' })).toBeTruthy();
    expect(screen.getByText('Mã 7F3K2')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Đã nhận chuyển khoản – Bàn 3' }));
    const sheet = screen.getByRole('dialog', { name: 'Xác nhận đã nhận chuyển khoản?' });
    expect(sheet.textContent).toContain('Bàn 3: 115.000\u00a0₫, mã hoá đơn 7F3K2.');
    expect(sheet.textContent).toContain('TQR 7F3K2');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Đã nhận 115.000\u00a0₫' }));
    expect((await screen.findByRole('status')).textContent).toContain(
      'Đã ghi nhận 115.000\u00a0₫ cho Bàn 3.',
    );
    expect(calls.find((c) => c.path === '/api/bills/b1/pay')?.body).toEqual({ method: 'transfer' });
    expect(await screen.findByText(/Chuyển khoản · Lan/)).toBeTruthy();
    expect(screen.getAllByText('Đã thanh toán').length).toBeGreaterThan(0);
  });

  it('AC45: a second confirmation shows that the bill was already paid', async () => {
    fakeApi({
      'GET /api/bills/overview': { body: overview() },
      'POST /api/bills/b1/pay': { status: 409, body: { code: 'ALREADY_PAID' } },
    });
    await renderWithApp(CashierPage, { paths: ['/dang-nhap'] });
    await userEvent.click(await screen.findByRole('button', { name: 'Đã nhận tiền mặt – Bàn 3' }));
    const sheet = screen.getByRole('dialog', { name: 'Xác nhận đã nhận tiền mặt?' });
    expect(sheet.textContent).toContain('Chỉ xác nhận khi đã cầm đủ tiền.');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Đã nhận 115.000\u00a0₫' }));
    expect((await within(sheet).findByRole('alert')).textContent).toContain('đã được xác nhận rồi');
  });

  it('AC47: closing an unpaid table asks for a reason and sends it', async () => {
    const calls = fakeApi({
      'GET /api/bills/overview': { body: overview() },
      'POST /api/sessions/s1/close': { body: { sessionId: 's1', status: 'closed' } },
    });
    await renderWithApp(CashierPage, { paths: ['/dang-nhap'] });
    await userEvent.click(await screen.findByRole('button', { name: 'Đóng bàn – Bàn 3' }));
    const sheet = screen.getByRole('dialog', { name: 'Đóng Bàn 3?' });
    expect(sheet.textContent).toContain('Bàn còn 115.000\u00a0₫ chưa thanh toán');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Đóng bàn' }));
    expect(within(sheet).getByText('Hãy ghi lý do đóng bàn.')).toBeTruthy();
    expect(calls.some((c) => c.path === '/api/sessions/s1/close')).toBe(false);
    await userEvent.type(
      within(sheet).getByLabelText('Lý do đóng bàn khi chưa thanh toán'),
      'Khách quen',
    );
    await userEvent.click(within(sheet).getByRole('button', { name: 'Đóng bàn' }));
    expect((await screen.findByRole('status')).textContent).toContain('Đã đóng Bàn 3.');
    expect(calls.find((c) => c.path === '/api/sessions/s1/close')?.body).toEqual({
      reason: 'Khách quen',
    });
  });

  it('AC46: closes a paid table without a reason', async () => {
    const calls = fakeApi({
      'GET /api/bills/overview': {
        body: overview({
          sessions: [
            session({
              paidVnd: 115_000,
              dueVnd: 0,
              bill: {
                ...bill({ status: 'paid', method: 'cash', paidAt: '2026-11-08T06:00:00Z' }),
                paidByName: null,
              },
            }),
          ],
        }),
      },
      'POST /api/sessions/s1/close': { body: { sessionId: 's1', status: 'closed' } },
    });
    await renderWithApp(CashierPage, { paths: ['/dang-nhap'] });
    await userEvent.click(await screen.findByRole('button', { name: 'Đóng bàn – Bàn 3' }));
    const sheet = screen.getByRole('dialog', { name: 'Đóng Bàn 3?' });
    expect(within(sheet).queryByRole('textbox')).toBeNull();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Đóng bàn' }));
    await screen.findByText('Đã đóng Bàn 3. Bàn đã trống.');
    expect(calls.find((c) => c.path === '/api/sessions/s1/close')?.body).toEqual({});
  });

  it('issues a bill for a table without one, and re-issues after more food', async () => {
    const calls = fakeApi({
      'GET /api/bills/overview': {
        body: overview({
          sessions: [
            session({ bill: null }),
            session({ sessionId: 's2', tableName: 'Bàn 5', dueVnd: 145_000, totalVnd: 145_000 }),
          ],
        }),
      },
      'POST /api/bills': { body: view() },
    });
    await renderWithApp(CashierPage, { paths: ['/dang-nhap'] });
    const buttons = await screen.findAllByRole('button', { name: 'Lấy hoá đơn' });
    expect(buttons).toHaveLength(2);
    expect(screen.getByText('Hoá đơn đã thay đổi')).toBeTruthy();
    expect(screen.getByText('Chưa có hoá đơn')).toBeTruthy();
    await userEvent.click(buttons[0] as HTMLElement);
    expect((await screen.findByRole('status')).textContent).toContain(
      'Hoá đơn Bàn 3: 115.000\u00a0₫, mã 7F3K2.',
    );
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ sessionId: 's1' });
  });

  it('warns for 24 h after the bank account changed; without a bank only cash is offered', async () => {
    fakeApi({
      'GET /api/bills/overview': {
        body: overview({ bankChangedRecently: true, bankChangedAt: '2026-11-08T05:00:00.000Z' }),
      },
    });
    await renderWithApp(CashierPage, { paths: ['/dang-nhap'] });
    expect((await screen.findByRole('alert')).textContent).toContain('Tài khoản nhận tiền vừa đổi');
    vi.unstubAllGlobals();
    vi.stubGlobal('EventSource', FakeEventSource);
    document.body.innerHTML = '';
    fakeApi({ 'GET /api/bills/overview': { body: overview({ bankConfigured: false }) } });
    await renderWithApp(CashierPage, { paths: ['/dang-nhap'] });
    expect(await screen.findByText(/khách thanh toán tại quầy/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Đã nhận chuyển khoản/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Đã nhận tiền mặt – Bàn 3' })).toBeTruthy();
  });

  it('shows empty and error states, and reloads on floor events', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let fail = true;
    const calls = fakeApi({
      'GET /api/bills/overview': () =>
        Promise.resolve(
          fail
            ? new Response(JSON.stringify({ code: 'INTERNAL' }), { status: 500 })
            : new Response(JSON.stringify(overview({ sessions: [] })), { status: 200 }),
        ),
    });
    await renderWithApp(CashierPage, { paths: ['/dang-nhap'] });
    expect(await screen.findByRole('button', { name: 'Thử lại' })).toBeTruthy();
    fail = false;
    FakeEventSource.last?.emit('delta', { type: 'bill.status' });
    await vi.advanceTimersByTimeAsync(200);
    expect(await screen.findByText('Chưa có bàn nào đang phục vụ')).toBeTruthy();
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });
});
