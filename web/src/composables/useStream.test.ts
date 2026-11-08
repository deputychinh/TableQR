import { effectScope } from 'vue';
import { isNewer, useStream, type StreamHandlers } from './useStream';

class FakeEventSource extends EventTarget {
  readyState = 0;
  closed = false;
  constructor(readonly url: string) {
    super();
  }
  emit(type: string, data?: unknown) {
    if (type !== 'error') this.readyState = 1;
    const event = new MessageEvent(type, {
      data: data === undefined ? undefined : JSON.stringify(data),
    });
    this.dispatchEvent(event);
  }
  close() {
    this.closed = true;
    this.readyState = 2;
  }
}

/** Opens a stream on fakes; `sources` grows with every (re)connect. */
const open = (handlers: Partial<StreamHandlers<unknown>> = {}) => {
  const sources: FakeEventSource[] = [];
  const snapshots: unknown[] = [];
  const deltas: unknown[] = [];
  const scope = effectScope();
  const stream = scope.run(() =>
    useStream(
      '/api/stream/floor',
      {
        onSnapshot: (s) => snapshots.push(s),
        onDelta: (d) => deltas.push(d),
        ...handlers,
      },
      {
        create: (url) => {
          const fake = new FakeEventSource(url);
          sources.push(fake);
          return fake as unknown as EventSource;
        },
      },
    ),
  );
  if (!stream) throw new Error('not created');
  const current = () => {
    const last = sources.at(-1);
    if (!last) throw new Error('no source');
    return last;
  };
  return { stream, sources, snapshots, deltas, scope, current };
};

describe('useStream', () => {
  afterEach(() => vi.useRealTimers());

  it('applies the snapshot, then deltas, and tracks reconnects', () => {
    const { stream, sources, snapshots, deltas, scope, current } = open();
    const fake = current();
    expect(fake.url).toBe('/api/stream/floor');
    expect(stream.status.value).toBe('connecting');
    fake.emit('snapshot', { items: [] });
    expect(stream.status.value).toBe('live');
    fake.emit('delta', { topic: 'floor', type: 'item.status', itemId: 'i1' });
    expect(deltas).toEqual([{ topic: 'floor', type: 'item.status', itemId: 'i1' }]);
    fake.emit('error');
    expect(stream.status.value).toBe('reconnecting');
    fake.emit('resync', {});
    fake.emit('snapshot', { items: [1] });
    expect(snapshots).toEqual([{ items: [] }, { items: [1] }]);
    expect(stream.status.value).toBe('live');
    expect(sources).toHaveLength(1);
    scope.stop();
    expect(fake.closed).toBe(true);
  });

  it('TQR-031 treats 2.5 heartbeats of silence as dead: closes, says reconnecting, reconnects', () => {
    vi.useFakeTimers();
    const { stream, sources, snapshots, current } = open();
    const first = current();
    first.emit('snapshot', { items: [] });
    first.emit('heartbeat', { intervalMs: 1000 });
    // Events keep it alive.
    vi.advanceTimersByTime(2400);
    first.emit('heartbeat', { intervalMs: 1000 });
    vi.advanceTimersByTime(2400);
    expect(stream.status.value).toBe('live');
    expect(first.closed).toBe(false);
    // Silence for 2.5 × 1 s: the stream is dead even though EventSource still says "open".
    vi.advanceTimersByTime(100);
    expect(stream.status.value).toBe('reconnecting');
    expect(first.closed).toBe(true);
    expect(sources).toHaveLength(1);
    // First retry after the shortest backoff; the snapshot repairs state and goes live.
    vi.advanceTimersByTime(1000);
    expect(sources).toHaveLength(2);
    current().emit('snapshot', { items: [7] });
    expect(stream.status.value).toBe('live');
    expect(snapshots.at(-1)).toEqual({ items: [7] });
  });

  it('TQR-031 uses the default 15 s heartbeat until the server names its own', () => {
    vi.useFakeTimers();
    const { stream, current } = open();
    current().emit('snapshot', { items: [] });
    vi.advanceTimersByTime(37_400);
    expect(stream.status.value).toBe('live');
    vi.advanceTimersByTime(200);
    expect(stream.status.value).toBe('reconnecting');
  });

  it('TQR-031 backs off between failed reconnects and resets after a snapshot', () => {
    vi.useFakeTimers();
    const { sources, current } = open();
    current().emit('snapshot', {});
    current().emit('heartbeat', { intervalMs: 1000 });
    vi.advanceTimersByTime(2500);
    const opensAfter = (ms: number) => {
      const before = sources.length;
      vi.advanceTimersByTime(ms - 1);
      expect(sources).toHaveLength(before);
      vi.advanceTimersByTime(1);
      expect(sources).toHaveLength(before + 1);
    };
    opensAfter(1000);
    // The proxy answers 502: the browser gives up on that EventSource (readyState CLOSED).
    current().close();
    current().emit('error');
    opensAfter(2000);
    current().close();
    current().emit('error');
    opensAfter(5000);
    current().emit('snapshot', {});
    current().emit('bye', {});
    opensAfter(1000);
  });

  it('TQR-032 reconnects after the server says `bye` (shutdown or restart)', () => {
    vi.useFakeTimers();
    const { stream, sources, current } = open();
    current().emit('snapshot', {});
    current().emit('bye', {});
    expect(stream.status.value).toBe('reconnecting');
    expect(sources[0]?.closed).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(sources).toHaveLength(2);
  });

  it('ignores events from a stream it already replaced, and stops every timer when disposed', () => {
    vi.useFakeTimers();
    const { stream, sources, scope, current } = open();
    current().emit('snapshot', {});
    current().emit('bye', {});
    vi.advanceTimersByTime(1000);
    sources[0]?.emit('snapshot', {});
    expect(stream.status.value).toBe('reconnecting');
    scope.stop();
    vi.advanceTimersByTime(120_000);
    expect(sources).toHaveLength(2);
    expect(sources[1]?.closed).toBe(true);
  });
});

describe('isNewer', () => {
  it.each([
    [undefined, 1, true],
    [1, 2, true],
    [2, 2, false],
    [3, 2, false],
    [1, undefined, false],
  ])('current %s, incoming %s → %s', (current, incoming, expected) => {
    expect(isNewer(current, incoming)).toBe(expected);
  });
});
