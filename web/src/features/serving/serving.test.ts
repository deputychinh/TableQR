import { screen, within } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import { jsonResponse, renderWithApp } from '@/test/render';
import { FakeEventSource, installFakeEventSource } from '@/test/fake-event-source';
import { applyReadyDelta } from './board-state';
import ServingPage from './pages/ServingPage.vue';
import type { FloorTable, ReadyBoard } from './services/serving.service';

installFakeEventSource();
afterEach(() => vi.unstubAllGlobals());

const table = (name: string, over: Partial<FloorTable> = {}): FloorTable => ({
  sessionId: `s-${name}`,
  tableName: `Bàn ${name}`,
  partySize: 4,
  ready: [],
  remaining: 0,
  served: 0,
  complete: false,
  ...over,
});
const item = (id: string, name = 'Phở bò tái') => ({
  id,
  version: 3,
  name,
  quantity: 1,
  note: null,
  doneAt: '2026-11-08T11:05:00.000Z',
});

describe('applyReadyDelta (AC36, AC37)', () => {
  const board: ReadyBoard = {
    tables: [
      table('1', { ready: [item('a')], served: 1 }),
      table('2', { ready: [item('b')], remaining: 1 }),
    ],
  };

  it('removes a served dish and marks a finished table "Đủ món"', () => {
    const next = applyReadyDelta(board, { itemId: 'a', status: 'served', version: 4 });
    expect(next.tables[0]).toMatchObject({ ready: [], served: 2, complete: true });
    const other = applyReadyDelta(board, { itemId: 'b', status: 'served', version: 4 });
    expect(other.tables[1]).toMatchObject({ ready: [], complete: false });
  });

  it('ignores older deltas, ready (done) deltas and unknown items', () => {
    expect(applyReadyDelta(board, { itemId: 'a', status: 'served', version: 3 })).toBe(board);
    expect(applyReadyDelta(board, { itemId: 'a', status: 'done', version: 9 })).toBe(board);
    expect(applyReadyDelta(board, { itemId: 'zz', status: 'served', version: 9 })).toBe(board);
  });
});

describe('ServingPage (S10)', () => {
  const stubApi = (boards: ReadyBoard[], serve?: () => Response) => {
    let reads = 0;
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const key = `${init?.method ?? 'GET'} ${String(input)}`;
      if (key === 'GET /api/serve/ready') {
        const next = boards[Math.min(reads, boards.length - 1)];
        reads += 1;
        return Promise.resolve(next ? jsonResponse(next) : jsonResponse({ code: 'X' }, 500));
      }
      if (key.startsWith('POST /api/serve/items/') && serve) return Promise.resolve(serve());
      return Promise.resolve(jsonResponse({ code: 'NOT_FOUND' }, 404));
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  it('lists ready dishes under their table and serves one; the table shows "Đủ món"', async () => {
    const before: ReadyBoard = {
      tables: [
        table('2', { ready: [item('a'), item('b', 'Trà đá')], served: 1 }),
        table('5', { remaining: 2 }),
      ],
    };
    const after: ReadyBoard = {
      tables: [
        table('2', { ready: [item('b', 'Trà đá')], served: 2 }),
        table('5', { remaining: 2 }),
      ],
    };
    const fetchMock = stubApi([before, after], () =>
      jsonResponse({ id: 'a', status: 'served', version: 4 }),
    );
    await renderWithApp(ServingPage, { paths: ['/phuc-vu', '/phuc-vu/duyet'], at: '/phuc-vu' });
    const card = await screen.findByRole('article', { name: 'Bàn 2 · 4 khách' });
    const dishes = within(card).getAllByRole('listitem');
    expect(dishes.map((d) => d.textContent)).toEqual([
      expect.stringContaining('Phở bò tái'),
      expect.stringContaining('Trà đá'),
    ]);
    expect(screen.getByText('Còn 2 món')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Đơn chờ duyệt' }).getAttribute('href')).toBe(
      '/phuc-vu/duyet',
    );

    await userEvent.click(
      within(dishes[0] as HTMLElement).getByRole('button', { name: 'Đã ra bàn' }),
    );
    expect(await screen.findByText('Đã ra bàn: Phở bò tái cho Bàn 2.')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/serve/items/a/serve',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ version: 3 }) }),
    );
    await vi.waitFor(() =>
      expect(within(screen.getByRole('article')).getAllByRole('listitem')).toHaveLength(1),
    );

    // The floor stream: the last dish served elsewhere, then the snapshot says "Đủ món".
    const stream = FakeEventSource.last('/api/stream/floor');
    stream.emit('delta', {
      topic: 'floor',
      type: 'item.status',
      itemId: 'b',
      status: 'served',
      version: 4,
    });
    expect(await screen.findByText('Đủ món')).toBeTruthy();
    stream.emit('snapshot', {
      at: 'now',
      ready: { tables: [table('2', { served: 3, complete: true })] },
    });
    expect(await screen.findByText('Chưa có món nào xong')).toBeTruthy();
    expect(screen.getByText('Đủ món')).toBeTruthy();
  });

  it('re-reads the board on 409 and says so; shows the error state when the first read fails', async () => {
    stubApi([{ tables: [table('1', { ready: [item('a')] })] }], () =>
      jsonResponse({ code: 'STALE_VERSION' }, 409),
    );
    const first = await renderWithApp(ServingPage, { paths: ['/phuc-vu'], at: '/phuc-vu' });
    await userEvent.click(await screen.findByRole('button', { name: 'Đã ra bàn' }));
    expect(
      await screen.findByText('Món này vừa được cập nhật ở máy khác. Danh sách đã được làm mới.'),
    ).toBeTruthy();
    first.unmount();

    stubApi([]);
    await renderWithApp(ServingPage, { paths: ['/phuc-vu'], at: '/phuc-vu' });
    expect(await screen.findByText('Không tải được danh sách món đã xong.')).toBeTruthy();
  });

  it('re-reads the board only for deltas that change it', async () => {
    const fetchMock = stubApi([{ tables: [] }]);
    await renderWithApp(ServingPage, { paths: ['/phuc-vu'], at: '/phuc-vu' });
    await screen.findByText('Chưa có món nào xong');
    const stream = FakeEventSource.last('/api/stream/floor');
    const delta = (status: string) =>
      stream.emit('delta', {
        topic: 'floor',
        type: 'item.status',
        itemId: 'x',
        status,
        version: 2,
      });
    delta('cooking');
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    delta('done');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('says it is reconnecting when the stream drops', async () => {
    stubApi([{ tables: [] }]);
    await renderWithApp(ServingPage, { paths: ['/phuc-vu'], at: '/phuc-vu' });
    await screen.findByText('Chưa có món nào xong');
    FakeEventSource.last('/api/stream/floor').emit('error');
    expect(await screen.findByText('Mất kết nối — đang kết nối lại…')).toBeTruthy();
  });
});
