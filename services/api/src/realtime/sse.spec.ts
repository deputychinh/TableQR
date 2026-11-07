import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import type { Listener, RealtimeHub } from './realtime.hub.js';
import { openStream, type StreamOptions } from './sse.js';

/** Minimal Express stand-ins: the response records what was written and whether it ended. */
const fakes = () => {
  let listener: Listener = () => undefined;
  let subscribedUser: string | undefined;
  const unsubscribe = vi.fn();
  const hub = {
    subscribe: (_r: string, _t: string[], l: Listener, userId?: string) => {
      listener = l;
      subscribedUser = userId;
      return unsubscribe;
    },
  } as unknown as RealtimeHub;
  const request = new EventEmitter() as unknown as Request;
  const written: string[] = [];
  const response = Object.assign(new EventEmitter(), {
    ended: false,
    status: vi.fn(),
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: (chunk: string) => written.push(chunk),
    end() {
      this.ended = true;
    },
  });
  return {
    hub,
    request,
    response,
    written,
    unsubscribe,
    emit: (event: Parameters<Listener>[0]) => listener(event),
    subscribedUser: () => subscribedUser,
  };
};

const options = (overrides: Partial<StreamOptions<unknown>> = {}): StreamOptions<unknown> => ({
  restaurantId: 'r1',
  topics: ['floor'],
  snapshot: () => Promise.resolve({ ok: true }),
  audience: { userId: 'u1', isStillAllowed: () => Promise.resolve(true) },
  ...overrides,
});

describe('openStream', () => {
  afterEach(() => vi.useRealTimers());

  it('reports a failed snapshot and tells the client, without ending the stream', async () => {
    const f = fakes();
    const onError = vi.fn();
    const failure = new Error('db down');
    await openStream(f.hub, f.request, f.response as unknown as Response, {
      ...options({ snapshot: () => Promise.reject(failure), onError }),
    });
    expect(onError).toHaveBeenCalledWith('snapshot', failure);
    expect(f.written.join('')).toContain('event: error');
    expect(f.response.ended).toBe(false);
    f.request.emit('close');
  });

  it('subscribes for the audience and ends with `revoked` on a revocation', async () => {
    const f = fakes();
    const onClose = vi.fn();
    await openStream(f.hub, f.request, f.response as unknown as Response, options({ onClose }));
    expect(f.subscribedUser()).toBe('u1');
    f.emit('revoked');
    expect(f.written.at(-1)).toContain('event: revoked');
    expect(f.response.ended).toBe(true);
    expect(f.unsubscribe).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    f.emit('revoked');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('ends at the heartbeat when the session no longer allows the stream', async () => {
    vi.useFakeTimers();
    const f = fakes();
    await openStream(f.hub, f.request, f.response as unknown as Response, {
      ...options({
        heartbeatMs: 100,
        audience: { userId: 'u1', isStillAllowed: () => Promise.resolve(false) },
      }),
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(f.response.ended).toBe(true);
  });

  it('keeps the stream and reports when the heartbeat check itself fails', async () => {
    vi.useFakeTimers();
    const f = fakes();
    const onError = vi.fn();
    await openStream(f.hub, f.request, f.response as unknown as Response, {
      ...options({
        heartbeatMs: 100,
        onError,
        audience: { userId: 'u1', isStillAllowed: () => Promise.reject(new Error('blip')) },
      }),
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(onError).toHaveBeenCalledWith('session_check', expect.any(Error));
    expect(f.response.ended).toBe(false);
    f.response.emit('close');
    expect(f.unsubscribe).toHaveBeenCalledOnce();
  });
});
