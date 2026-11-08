import { effectScope } from 'vue';
import { staffSessionAlive } from './staff-stream';
import { isNewer, useStream, type StreamHandlers, type StreamOptions } from './useStream';

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
const open = (
  handlers: Partial<StreamHandlers<unknown>> = {},
  extra: Omit<StreamOptions, 'create'> = {},
) => {
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
        // The top of each jitter range unless a test says otherwise, so delays are exact.
        random: () => 1,
        ...extra,
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

  it('TQR-031 never waits more than 10 s between attempts, so a restarted API is back quickly', () => {
    vi.useFakeTimers();
    const { sources, current } = open();
    current().emit('snapshot', {});
    const waits: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      current().close();
      current().emit('error');
      const before = sources.length;
      let waited = 0;
      while (sources.length === before) {
        vi.advanceTimersByTime(100);
        waited += 100;
      }
      waits.push(waited);
    }
    expect(waits).toEqual([1000, 2000, 5000, 10_000, 10_000, 10_000, 10_000]);
  });

  it('TQR-031 spreads reconnects with jitter (half to all of each step)', () => {
    vi.useFakeTimers();
    const { sources, current } = open({}, { random: () => 0 });
    current().emit('snapshot', {});
    current().emit('bye', {});
    vi.advanceTimersByTime(499);
    expect(sources).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sources).toHaveLength(2);
  });

  it('TQR-031 stops on `revoked`: no reconnect, status ended, the screen is told once', () => {
    vi.useFakeTimers();
    const onRevoked = vi.fn<() => void>();
    const { stream, sources, snapshots, current } = open({}, { onRevoked });
    current().emit('snapshot', { n: 1 });
    current().emit('revoked', {});
    expect(stream.status.value).toBe('ended');
    expect(onRevoked).toHaveBeenCalledOnce();
    expect(sources[0]?.closed).toBe(true);
    // The browser's own error after the server ended the response changes nothing.
    current().emit('error');
    current().emit('snapshot', { n: 2 });
    vi.advanceTimersByTime(120_000);
    expect(sources).toHaveLength(1);
    expect(stream.status.value).toBe('ended');
    expect(snapshots).toEqual([{ n: 1 }]);
    expect(onRevoked).toHaveBeenCalledOnce();
  });

  it('TQR-031 a stream the browser gave up on is ended when the session is gone (401), retried when not', async () => {
    vi.useFakeTimers();
    let signedIn = true;
    const onRevoked = vi.fn<() => void>();
    const checkSession = vi.fn<() => Promise<boolean>>(() => Promise.resolve(signedIn));
    const { stream, sources, current } = open({}, { onRevoked, checkSession });
    current().emit('snapshot', {});
    // Proxy 502 while still signed in: retried.
    current().close();
    current().emit('error');
    await vi.advanceTimersByTimeAsync(1000);
    expect(sources).toHaveLength(2);
    expect(onRevoked).not.toHaveBeenCalled();
    // Signed out elsewhere: the stream answers 401, the browser gives up, the session check fails.
    signedIn = false;
    current().close();
    current().emit('error');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sources).toHaveLength(2);
    expect(stream.status.value).toBe('ended');
    expect(onRevoked).toHaveBeenCalledOnce();
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

describe('staffSessionAlive (TQR-031)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    [200, true],
    [401, false],
    [502, true],
  ])('/api/me answering %s → %s', async (status, alive) => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() =>
        Promise.resolve(
          new Response(JSON.stringify(status === 200 ? {} : { code: 'X' }), {
            status,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    );
    await expect(staffSessionAlive()).resolves.toBe(alive);
  });

  it('keeps trying through a network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline'))),
    );
    await expect(staffSessionAlive()).resolves.toBe(true);
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
