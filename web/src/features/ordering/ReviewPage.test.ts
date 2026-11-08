import { screen, waitFor, within } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { fakeApi } from '@/test/fake-api';
import { renderWithApp } from '@/test/render';
import { useSessionStore } from '@/stores/session';
import type { ReviewOrder } from './api';
import ReviewPage from './pages/ReviewPage.vue';

class FakeEventSource extends EventTarget {
  static last: FakeEventSource | undefined;
  constructor(readonly url: string) {
    super();
    FakeEventSource.last = this;
  }
  emit(type: string, data?: unknown) {
    this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data ?? {}) }));
  }
  close() {}
}

const held = (over: Partial<ReviewOrder> = {}): ReviewOrder => ({
  id: 'o1',
  status: 'held',
  holdReason: 'anomaly_over',
  flag: null,
  requestedAt: '2026-11-08T12:05:00.000Z',
  totalVnd: 135000,
  maxMainPerPerson: 2,
  mainPortions: 3,
  sessionMainPortions: 3,
  session: { id: 's1', partySize: 1, openedAt: '2026-11-08T12:00:00.000Z' },
  table: { id: 't1', name: 'Bàn 1' },
  items: [
    {
      id: 'i1',
      menuItemId: 'pho',
      name: 'Phở bò',
      priceVnd: 45000,
      quantity: 3,
      note: 'ít hành',
      isMain: true,
      status: 'pending',
      version: 1,
    },
  ],
  ...over,
});

const flagged = held({
  id: 'o2',
  status: 'released',
  holdReason: null,
  flag: 'maybe_short',
  mainPortions: 1,
  session: { id: 's2', partySize: 4, openedAt: '2026-11-08T12:00:00.000Z' },
  table: { id: 't2', name: 'Bàn 2' },
});

const renderReview = async () => {
  const result = await renderWithApp(ReviewPage, {
    paths: ['/phuc-vu/duyet', '/dang-nhap'],
    at: '/phuc-vu/duyet',
  });
  useSessionStore().me = {
    user: { id: 'u', email: 'w@x.vn', role: 'waiter', displayName: '' },
    restaurant: { id: 'r', name: 'Quán Ngon', slug: 'quan-ngon' },
  };
  return result;
};

beforeEach(() => vi.stubGlobal('EventSource', FakeEventSource));
afterEach(() => vi.unstubAllGlobals());

describe('waiter review page (S8)', () => {
  it('AC26/AC27 lists held and flagged orders with table, party, items and reason', async () => {
    fakeApi({ 'GET /api/orders/review': { body: { items: [held(), flagged] } } });
    await renderReview();
    const cards = await screen.findAllByRole('article');
    expect(cards).toHaveLength(2);
    const first = within(cards[0]!);
    expect(first.getByRole('heading', { name: 'Bàn 1' })).toBeTruthy();
    expect(first.getByText(/1 người · Gửi lúc/)).toBeTruthy();
    expect(first.getByText('Chờ xác nhận')).toBeTruthy();
    expect(first.getByText('Bàn đã gọi 3 phần món chính, quá mức 2 phần cho 1 người')).toBeTruthy();
    expect(first.getByText('ít hành')).toBeTruthy();
    expect(first.getByText('3 phần món chính')).toBeTruthy();
    const second = within(cards[1]!);
    expect(second.getByText('Có thể thiếu món')).toBeTruthy();
    expect(second.getByText(/Bàn 4 người mới gọi 1 phần món chính/)).toBeTruthy();
    expect(second.queryByRole('button', { name: /Xác nhận/ })).toBeNull();
  });

  it('TQR-013 a drinks-only order held because the rule is "every order" says so, not "too many mains"', async () => {
    const drinks = held({
      holdReason: 'every_order',
      mainPortions: 0,
      sessionMainPortions: 5,
      items: [{ ...held().items[0]!, name: 'Trà đá', isMain: false, note: null }],
    });
    fakeApi({ 'GET /api/orders/review': { body: { items: [drinks] } } });
    await renderReview();
    const card = within(await screen.findByRole('article'));
    expect(card.getByText('Quán xác nhận mọi đơn')).toBeTruthy();
    expect(card.queryByText(/món chính, quá mức/)).toBeNull();
    expect(card.queryByText(/Nhiều món chính/)).toBeNull();
  });

  it('AC28 confirms an order and says so', async () => {
    const calls = fakeApi({
      'GET /api/orders/review': { body: { items: [held()] } },
      'POST /api/orders/o1/confirm': { body: held({ status: 'released' }) },
    });
    await renderReview();
    await userEvent.click(await screen.findByRole('button', { name: 'Xác nhận đơn của Bàn 1' }));
    expect(calls.some((c) => c.method === 'POST' && c.path === '/api/orders/o1/confirm')).toBe(
      true,
    );
    expect(await screen.findByText('Đã xác nhận đơn của Bàn 1. Món đã vào bếp.')).toBeTruthy();
  });

  it('AC28 rejects only after the confirm sheet spells out the consequence', async () => {
    const calls = fakeApi({
      'GET /api/orders/review': { body: { items: [held()] } },
      'POST /api/orders/o1/reject': { body: held({ status: 'rejected' }) },
    });
    await renderReview();
    await userEvent.click(await screen.findByRole('button', { name: 'Từ chối đơn của Bàn 1' }));
    const sheet = await screen.findByRole('dialog', { name: 'Từ chối đơn của Bàn 1?' });
    expect(within(sheet).getByText(/Khách sẽ thấy đơn đã bị huỷ/)).toBeTruthy();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Huỷ' }));
    expect(calls.some((c) => c.path.endsWith('/reject'))).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Từ chối đơn của Bàn 1' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Từ chối đơn' }),
    );
    expect(await screen.findByText('Đã từ chối đơn của Bàn 1.')).toBeTruthy();
  });

  it('marks a flag seen', async () => {
    const calls = fakeApi({
      'GET /api/orders/review': { body: { items: [flagged] } },
      'POST /api/orders/o2/flag-seen': { status: 204 },
    });
    await renderReview();
    await userEvent.click(await screen.findByRole('button', { name: 'Đã xem đơn của Bàn 2' }));
    expect(calls.some((c) => c.path === '/api/orders/o2/flag-seen')).toBe(true);
    expect(await screen.findByText('Đã đánh dấu đã xem đơn của Bàn 2.')).toBeTruthy();
  });

  it('says when someone else handled the order first', async () => {
    fakeApi({
      'GET /api/orders/review': { body: { items: [held()] } },
      'POST /api/orders/o1/confirm': { status: 409, body: { code: 'ORDER_NOT_HELD' } },
    });
    await renderReview();
    await userEvent.click(await screen.findByRole('button', { name: 'Xác nhận đơn của Bàn 1' }));
    expect((await screen.findByRole('alert')).textContent).toContain('vừa được người khác xử lý');
  });

  it('shows the empty state, and reloads live when an order changes on the floor', async () => {
    let items: ReviewOrder[] = [];
    fakeApi({
      'GET /api/orders/review': () => Promise.resolve(new Response(JSON.stringify({ items }))),
    });
    await renderReview();
    expect(await screen.findByRole('heading', { name: 'Không có đơn nào cần duyệt' })).toBeTruthy();
    expect(FakeEventSource.last?.url).toBe('/api/stream/floor');
    items = [held()];
    FakeEventSource.last?.emit('delta', {
      topic: 'floor',
      type: 'order.status',
      orderId: 'o1',
      status: 'held',
    });
    expect(await screen.findByRole('heading', { name: 'Bàn 1' })).toBeTruthy();
  });

  it('shows an error with retry when the list cannot load', async () => {
    let fail = true;
    fakeApi({
      'GET /api/orders/review': () =>
        Promise.resolve(
          fail
            ? new Response(JSON.stringify({ code: 'INTERNAL' }), { status: 500 })
            : new Response(JSON.stringify({ items: [] })),
        ),
    });
    await renderReview();
    expect(await screen.findByText('Không tải được danh sách đơn.')).toBeTruthy();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Không có đơn nào cần duyệt' })).toBeTruthy(),
    );
  });
});
