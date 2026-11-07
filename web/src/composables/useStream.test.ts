import { effectScope } from 'vue';
import { isNewer, useStream } from './useStream';

class FakeEventSource extends EventTarget {
  closed = false;
  constructor(readonly url: string) {
    super();
  }
  emit(type: string, data?: unknown) {
    const event = new MessageEvent(type, {
      data: data === undefined ? undefined : JSON.stringify(data),
    });
    this.dispatchEvent(event);
  }
  close() {
    this.closed = true;
  }
}

describe('useStream', () => {
  it('applies the snapshot, then deltas, and tracks reconnects', () => {
    let fake: FakeEventSource | undefined;
    const snapshots: unknown[] = [];
    const deltas: unknown[] = [];
    const scope = effectScope();
    const stream = scope.run(() =>
      useStream(
        '/api/stream/floor',
        { onSnapshot: (s) => snapshots.push(s), onDelta: (d) => deltas.push(d) },
        (url) => {
          fake = new FakeEventSource(url);
          return fake as unknown as EventSource;
        },
      ),
    );
    if (!stream || !fake) throw new Error('not created');
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
    scope.stop();
    expect(fake.closed).toBe(true);
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
