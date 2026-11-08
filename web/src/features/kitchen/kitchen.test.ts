import { render, screen, within } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { i18n } from '@/locales';
import { jsonResponse, renderWithApp } from '@/test/render';
import { FakeEventSource, installFakeEventSource } from '@/test/fake-event-source';
import TicketCard from './components/TicketCard.vue';
import KitchenPage from './pages/KitchenPage.vue';
import {
  applyItemDelta,
  isLate,
  mergeServerList,
  olderSameDish,
  waitedMinutes,
  type SeenStatus,
} from './queue-state';
import type { StationQueue, Ticket } from './services/kitchen.service';

installFakeEventSource();
afterEach(() => vi.unstubAllGlobals());

const NOW = Date.parse('2026-11-08T12:00:00.000Z');
const ticket = (id: string, over: Partial<Ticket> = {}): Ticket => ({
  id,
  version: 1,
  status: 'waiting',
  menuItemId: 'pho',
  name: 'Phở bò tái',
  quantity: 1,
  note: null,
  sessionId: `s-${id}`,
  tableName: `Bàn ${id}`,
  partySize: 2,
  queueAt: new Date(NOW - 5 * 60_000).toISOString(),
  startedAt: null,
  lateAt: new Date(NOW + 10 * 60_000).toISOString(),
  ...over,
});

describe('queue state (ADR 0004 deltas, AC30 order kept)', () => {
  it('updates a known item in place and never reorders', () => {
    const seen = new Map<string, SeenStatus>();
    const items = [ticket('1'), ticket('2'), ticket('3')];
    const result = applyItemDelta(items, seen, { itemId: '2', status: 'cooking', version: 2 });
    expect(result.items.map((i) => [i.id, i.status])).toEqual([
      ['1', 'waiting'],
      ['2', 'cooking'],
      ['3', 'waiting'],
    ]);
    expect(result.refetch).toBe(false);
  });

  it('drops an item that left the queue and ignores older or repeated deltas', () => {
    const seen = new Map<string, SeenStatus>();
    let items = [ticket('1', { version: 2, status: 'cooking' }), ticket('2')];
    items = applyItemDelta(items, seen, { itemId: '1', status: 'done', version: 3 }).items;
    expect(items.map((i) => i.id)).toEqual(['2']);
    const stale = applyItemDelta(items, seen, { itemId: '1', status: 'cooking', version: 2 });
    expect(stale.items.map((i) => i.id)).toEqual(['2']);
    expect(stale.refetch).toBe(false);
    const older = applyItemDelta([ticket('9', { version: 4, status: 'cooking' })], new Map(), {
      itemId: '9',
      status: 'waiting',
      version: 3,
    });
    expect(older.items[0]?.status).toBe('cooking');
  });

  it('asks for a re-read when an unknown item joins the queue (released order)', () => {
    const result = applyItemDelta([ticket('1')], new Map(), {
      itemId: 'new',
      status: 'waiting',
      version: 1,
    });
    expect(result.refetch).toBe(true);
    expect(
      applyItemDelta([], new Map(), { itemId: 'x', status: 'served', version: 5 }).refetch,
    ).toBe(false);
  });

  it('merges a server list with deltas that were newer than it', () => {
    const seen = new Map<string, SeenStatus>([
      ['1', { status: 'done', version: 3 }],
      ['2', { status: 'cooking', version: 2 }],
      ['3', { status: 'waiting', version: 1 }],
    ]);
    const merged = mergeServerList([ticket('1'), ticket('2'), ticket('3')], seen);
    expect(merged.map((i) => [i.id, i.status, i.version])).toEqual([
      ['2', 'cooking', 2],
      ['3', 'waiting', 1],
    ]);
  });

  it('finds older tickets of the same dish by position (the server order)', () => {
    const items = [
      ticket('1'),
      ticket('2', { menuItemId: 'bun' }),
      ticket('3', { status: 'cooking' }),
      ticket('4'),
    ];
    expect(olderSameDish(items, items[2] as Ticket).map((i) => i.id)).toEqual(['1']);
    expect(olderSameDish(items, ticket('zz'))).toEqual([]);
  });

  it('is late only after lateAt (AC33) and counts whole minutes waited', () => {
    const lateAt = Date.parse(ticket('1').lateAt);
    expect(isLate(ticket('1'), lateAt)).toBe(false);
    expect(isLate(ticket('1'), lateAt + 1)).toBe(true);
    expect(waitedMinutes(ticket('1'), NOW)).toBe(5);
    expect(waitedMinutes(ticket('1'), NOW - 10 * 60_000)).toBe(0);
  });
});

describe('TicketCard (AC34, AC33)', () => {
  const renderCard = (t: Ticket, now: number) =>
    render(TicketCard, { props: { ticket: t, now, busy: false }, global: { plugins: [i18n] } });

  it('shows table, party, quantity, dish, note and wait time, with a big start button', () => {
    renderCard(ticket('3', { quantity: 2, partySize: 5, note: 'Không hành' }), NOW);
    expect(screen.getByRole('heading', { name: 'Bàn 3 · 5 khách' })).toBeTruthy();
    expect(screen.getByText('2 ×')).toBeTruthy();
    expect(screen.getByText(/Phở bò tái/)).toBeTruthy();
    expect(screen.getByText('Ghi chú: Không hành')).toBeTruthy();
    expect(screen.getByText('Chờ 5 phút')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bắt đầu nấu' })).toBeTruthy();
    expect(screen.queryByText('Trễ')).toBeNull();
  });

  it('marks a late ticket with an icon and the word "Trễ", not colour alone', () => {
    const { container } = renderCard(ticket('3', { status: 'cooking' }), NOW + 11 * 60_000);
    expect(screen.getByText('Trễ')).toBeTruthy();
    expect(container.querySelector('.ticket-card--late')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Xong' })).toBeTruthy();
  });

  it('says "Vừa vào" for a ticket that just arrived', () => {
    renderCard(ticket('1', { queueAt: new Date(NOW).toISOString() }), NOW);
    expect(screen.getByText('Vừa vào')).toBeTruthy();
  });
});

describe('KitchenPage (S9)', () => {
  const stations = [
    { id: 'hot', name: 'Bếp nóng', lateAfterMinutes: 15, waiting: 2, cooking: 1 },
    { id: 'bar', name: 'Quầy bar', lateAfterMinutes: 5, waiting: 0, cooking: 0 },
  ];
  const queue = (items: Ticket[]): StationQueue => ({
    station: { id: 'hot', name: 'Bếp nóng', lateAfterMinutes: 15 },
    serverTime: new Date().toISOString(),
    items,
  });

  type Handler = (body: unknown) => Response;
  const stubApi = (routes: Record<string, Handler>) => {
    const calls: { key: string; body: unknown }[] = [];
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const key = `${init?.method ?? 'GET'} ${String(input)}`;
      const body: unknown = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ key, body });
      const handler = routes[key];
      return Promise.resolve(handler ? handler(body) : jsonResponse({ code: 'NOT_FOUND' }, 404));
    });
    vi.stubGlobal('fetch', fetchMock);
    return calls;
  };

  const now = () => Date.now();
  const recent = (minutes: number) => new Date(now() - minutes * 60_000).toISOString();

  it('shows station tabs and the chosen station’s queue in two columns, oldest first', async () => {
    const items = [
      ticket('1', { status: 'cooking', queueAt: recent(20), lateAt: recent(5) }),
      ticket('2', { queueAt: recent(4), lateAt: recent(-11) }),
      ticket('3', { menuItemId: 'bun', name: 'Bún chả', queueAt: recent(1), lateAt: recent(-14) }),
    ];
    stubApi({
      'GET /api/kitchen/stations': () => jsonResponse({ stations }),
      'GET /api/kitchen/stations/hot/queue': () => jsonResponse(queue(items)),
    });
    const { router } = await renderWithApp(KitchenPage, { paths: ['/bep'], at: '/bep' });
    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    // Each tab says how many dishes wait there (TQR-014 review); none shows no count.
    expect(screen.getByRole('tab', { name: 'Bếp nóng , 2 món đang chờ' })).toBe(tabs[0]);
    expect(screen.getByRole('tab', { name: 'Quầy bar' })).toBe(tabs[1]);
    const waiting = await screen.findByRole('region', { name: 'Đang chờ (2)' });
    expect(
      within(waiting)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent?.trim()),
    ).toEqual(['Bàn 2 · 2 khách', 'Bàn 3 · 2 khách']);
    const cooking = screen.getByRole('region', { name: 'Đang nấu (1)' });
    expect(within(cooking).getByText('Trễ')).toBeTruthy();
    expect(FakeEventSource.last('/api/stream/station/hot')).toBeTruthy();

    // Arrow keys move to the next station; the URL keeps the choice.
    tabs[0]?.focus();
    await userEvent.keyboard('{ArrowRight}');
    await vi.waitFor(() => expect(router.currentRoute.value.query.khu).toBe('bar'));
  });

  it('applies the stream: snapshot, a status delta, and a new released item re-reads the queue', async () => {
    const calls = stubApi({
      'GET /api/kitchen/stations': () => jsonResponse({ stations }),
      'GET /api/kitchen/stations/hot/queue': () => jsonResponse(queue([ticket('1')])),
    });
    await renderWithApp(KitchenPage, { paths: ['/bep'], at: '/bep' });
    await screen.findByRole('region', { name: 'Đang chờ (1)' });
    const stream = FakeEventSource.last('/api/stream/station/hot');
    stream.emit('snapshot', queue([ticket('1'), ticket('2')]));
    await screen.findByRole('region', { name: 'Đang chờ (2)' });
    stream.emit('delta', {
      topic: 'station:hot',
      type: 'item.status',
      itemId: '2',
      status: 'cooking',
      version: 2,
    });
    await screen.findByRole('region', { name: 'Đang nấu (1)' });
    const reads = calls.filter((c) => c.key.endsWith('/queue')).length;
    stream.emit('delta', {
      topic: 'station:hot',
      type: 'item.status',
      itemId: 'new',
      status: 'waiting',
      version: 1,
    });
    await vi.waitFor(() =>
      expect(calls.filter((c) => c.key.endsWith('/queue')).length).toBe(reads + 1),
    );
  });

  it('starts cooking, finishes, and asks for a reason before overtaking an older table (AC32)', async () => {
    const older = ticket('1');
    const younger = ticket('2', { status: 'cooking', version: 2 });
    let finishAttempts = 0;
    const calls = stubApi({
      'GET /api/kitchen/stations': () => jsonResponse({ stations }),
      'GET /api/kitchen/stations/hot/queue': () => jsonResponse(queue([older, younger])),
      'POST /api/kitchen/items/1/start': () =>
        jsonResponse({ id: '1', status: 'cooking', version: 2, skipReason: null }),
      'POST /api/kitchen/items/2/done': (body) => {
        finishAttempts += 1;
        const reason = (body as { skipReason?: string }).skipReason;
        return reason
          ? jsonResponse({ id: '2', status: 'done', version: 3, skipReason: reason })
          : jsonResponse({ code: 'SKIP_REASON_REQUIRED', older: [] }, 422);
      },
    });
    await renderWithApp(KitchenPage, { paths: ['/bep'], at: '/bep' });
    const cooking = await screen.findByRole('region', { name: 'Đang nấu (1)' });
    await userEvent.click(within(cooking).getByRole('button', { name: 'Xong' }));
    const sheet = await screen.findByRole('dialog', { name: 'Có bàn gọi món này trước' });
    expect(within(sheet).getByText(/Bàn 1 gọi Phở bò tái trước bàn này/)).toBeTruthy();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Xong món này' }));
    expect(await within(sheet).findByText('Hãy ghi lý do.')).toBeTruthy();
    await userEvent.type(within(sheet).getByLabelText('Lý do làm bàn này trước'), 'Khách giục');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Xong món này' }));
    await screen.findByText('Phở bò tái cho Bàn 2 đã xong.');
    expect(finishAttempts).toBe(2);
    expect(calls.find((c) => c.key === 'POST /api/kitchen/items/2/done' && c.body)?.body).toEqual({
      version: 2,
    });
    expect(calls.at(-1)?.body).toEqual({ version: 2, skipReason: 'Khách giục' });
    expect(screen.getByRole('region', { name: 'Đang nấu (0)' })).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Bắt đầu nấu' }));
    await screen.findByRole('region', { name: 'Đang nấu (1)' });
  });

  it('TQR-025 "Bỏ món" asks first, then sends the version and the ticket leaves the queue', async () => {
    const calls = stubApi({
      'GET /api/kitchen/stations': () => jsonResponse({ stations }),
      'GET /api/kitchen/stations/hot/queue': () =>
        jsonResponse(queue([ticket('1'), ticket('2', { status: 'cooking', version: 2 })])),
      'POST /api/kitchen/items/2/cancel': () =>
        jsonResponse({ id: '2', status: 'cancelled', version: 3, skipReason: null }),
    });
    await renderWithApp(KitchenPage, { paths: ['/bep'], at: '/bep' });
    const cooking = await screen.findByRole('region', { name: 'Đang nấu (1)' });
    await userEvent.click(within(cooking).getByRole('button', { name: 'Bỏ món' }));
    const sheet = await screen.findByRole('dialog', { name: 'Bỏ Phở bò tái của Bàn 2?' });
    expect(sheet.textContent).toContain('không phải trả tiền món này');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Huỷ' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls.some((c) => c.key.endsWith('/cancel'))).toBe(false);

    await userEvent.click(within(cooking).getByRole('button', { name: 'Bỏ món' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Bỏ món' }),
    );
    expect(
      await screen.findByText('Đã bỏ Phở bò tái của Bàn 2. Hoá đơn của bàn đã được cập nhật.'),
    ).toBeTruthy();
    expect(calls.at(-1)).toEqual({ key: 'POST /api/kitchen/items/2/cancel', body: { version: 2 } });
    expect(screen.getByRole('region', { name: 'Đang nấu (0)' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Đang chờ (1)' })).toBeTruthy();
  });

  it('says "món này gọi trước" when the older order of the dish is the same table', async () => {
    const older = ticket('1', { tableName: 'Bàn 1' });
    const younger = ticket('2', { tableName: 'Bàn 1', status: 'cooking', version: 2 });
    stubApi({
      'GET /api/kitchen/stations': () => jsonResponse({ stations }),
      'GET /api/kitchen/stations/hot/queue': () => jsonResponse(queue([older, younger])),
      'POST /api/kitchen/items/2/done': () =>
        jsonResponse({ code: 'SKIP_REASON_REQUIRED', older: [] }, 422),
    });
    await renderWithApp(KitchenPage, { paths: ['/bep'], at: '/bep' });
    const cooking = await screen.findByRole('region', { name: 'Đang nấu (1)' });
    await userEvent.click(within(cooking).getByRole('button', { name: 'Xong' }));
    const sheet = await screen.findByRole('dialog', { name: 'Có bàn gọi món này trước' });
    expect(sheet.textContent).toContain('Bàn này có một phần Phở bò tái gọi trước món này.');
    expect(sheet.textContent).not.toContain('Bàn 1 gọi');
  });

  it('keeps the open station’s tab count live from its queue', async () => {
    stubApi({
      'GET /api/kitchen/stations': () => jsonResponse({ stations }),
      'GET /api/kitchen/stations/hot/queue': () => jsonResponse(queue([ticket('1')])),
    });
    await renderWithApp(KitchenPage, { paths: ['/bep'], at: '/bep' });
    await screen.findByRole('region', { name: 'Đang chờ (1)' });
    expect(await screen.findByRole('tab', { name: 'Bếp nóng , 1 món đang chờ' })).toBeTruthy();
  });

  it('says the item changed elsewhere and re-reads the queue on 409', async () => {
    let reads = 0;
    stubApi({
      'GET /api/kitchen/stations': () => jsonResponse({ stations }),
      'GET /api/kitchen/stations/hot/queue': () => {
        reads += 1;
        return jsonResponse(queue(reads === 1 ? [ticket('1')] : []));
      },
      'POST /api/kitchen/items/1/start': () => jsonResponse({ code: 'STALE_VERSION' }, 409),
    });
    await renderWithApp(KitchenPage, { paths: ['/bep'], at: '/bep' });
    await userEvent.click(await screen.findByRole('button', { name: 'Bắt đầu nấu' }));
    expect(
      await screen.findByText('Món này vừa thay đổi ở máy khác. Hàng chờ đã được cập nhật.'),
    ).toBeTruthy();
    expect(await screen.findByText('Chưa có món nào cần làm')).toBeTruthy();
  });

  it('shows empty, no-station and error states', async () => {
    stubApi({ 'GET /api/kitchen/stations': () => jsonResponse({ stations: [] }) });
    const first = await renderWithApp(KitchenPage, { paths: ['/bep'], at: '/bep' });
    expect(await screen.findByText('Chưa có khu bếp')).toBeTruthy();
    first.unmount();

    stubApi({ 'GET /api/kitchen/stations': () => jsonResponse({ code: 'INTERNAL' }, 500) });
    const second = await renderWithApp(KitchenPage, { paths: ['/bep'], at: '/bep' });
    expect(await screen.findByText('Không tải được hàng chờ của bếp.')).toBeTruthy();
    second.unmount();

    stubApi({
      'GET /api/kitchen/stations': () => jsonResponse({ stations }),
      'GET /api/kitchen/stations/hot/queue': () => jsonResponse({ code: 'INTERNAL' }, 500),
    });
    await renderWithApp(KitchenPage, { paths: ['/bep'], at: '/bep' });
    expect(await screen.findByRole('button', { name: 'Thử lại' })).toBeTruthy();
  });
});
