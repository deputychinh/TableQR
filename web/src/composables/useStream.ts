import { onScopeDispose, ref } from 'vue';

/** `ended`: the server revoked the stream or the session is gone; it is not reopened. */
export type StreamStatus = 'connecting' | 'live' | 'reconnecting' | 'ended';

export interface StreamDelta {
  topic: string;
  type: string;
  [key: string]: unknown;
}

export interface StreamHandlers<S> {
  /** Replace local state with the server's truth (on open and after every reconnect). */
  onSnapshot: (snapshot: S) => void;
  onDelta: (delta: StreamDelta) => void;
}

type EventSourceFactory = (url: string) => EventSource;

export interface StreamOptions {
  create?: EventSourceFactory;
  /** Used until the server's first `heartbeat` event names its own interval. */
  heartbeatMs?: number;
  /**
   * Told once when the stream ends for good: the server sent `revoked` (access ended), or the
   * browser gave up and `checkSession` says the session is gone (401). Staff screens send the person
   * to sign-in (`staffStream`).
   */
  onRevoked?: () => void;
  /** Asked when the browser gives up on a connection: false (signed out) ends the stream. */
  checkSession?: () => Promise<boolean>;
  /** Jitter source, 0…1 (tests pin it). */
  random?: () => number;
}

/** The server's default `TQR_SSE_HEARTBEAT_MS`. */
export const DEFAULT_HEARTBEAT_MS = 15_000;
/** No event at all for this many heartbeats → the stream is dead (TQR-031). */
export const DEAD_AFTER_HEARTBEATS = 2.5;
/**
 * Upper bound of the wait before each reconnect attempt; the last one repeats, so a restarted API
 * is back within ~10 s. Reset by a snapshot. Each wait is jittered to half…all of its step, so a
 * room of screens does not reconnect in lockstep.
 */
export const RECONNECT_DELAYS_MS: readonly number[] = [1_000, 2_000, 5_000, 10_000];

/** `EventSource.CLOSED`: the browser gave up (e.g. a proxy answered 502) and will not retry. */
const CLOSED = 2;

/**
 * Subscribes to a server-sent event stream (ADR 0004); every (re)connect starts with a snapshot,
 * so missed deltas never leave the screen stale.
 *
 * Liveness (TQR-031, ADR 0010): the server sends a `heartbeat` event every `intervalMs`. A stream
 * that delivers nothing for 2.5 heartbeats is dead even when EventSource still reports "open" (an
 * API that went away behind a proxy), so it is closed and reopened with backoff, status
 * `reconnecting` until the next snapshot. The same happens on `bye` (server shutdown, TQR-032) and
 * when the browser itself gives up on the connection.
 */
export const useStream = <S>(
  url: string,
  handlers: StreamHandlers<S>,
  options: StreamOptions = {},
) => {
  const create = options.create ?? ((u) => new EventSource(u, { withCredentials: true }));
  const status = ref<StreamStatus>('connecting');
  let heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  let source: EventSource | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let disposed = false;
  let ended = false;
  const random = options.random ?? Math.random;

  const parse = (event: Event): unknown => JSON.parse((event as MessageEvent<string>).data);

  const arm = () => {
    clearTimeout(watchdog);
    watchdog = setTimeout(reconnectLater, heartbeatMs * DEAD_AFTER_HEARTBEATS);
  };

  /** Drops the current connection and opens a new one after the next backoff step. */
  function reconnectLater() {
    status.value = 'reconnecting';
    clearTimeout(watchdog);
    source?.close();
    if (retry !== undefined || disposed || ended) return;
    const step = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)] ?? 10_000;
    const delay = Math.round(step / 2 + random() * (step / 2));
    attempt += 1;
    retry = setTimeout(() => {
      retry = undefined;
      connect();
    }, delay);
  }

  /** The stream ends for good (revoked, signed out): no banner, no reconnect, the screen is told. */
  const end = () => {
    if (ended || disposed) return;
    ended = true;
    clearTimeout(watchdog);
    clearTimeout(retry);
    source?.close();
    status.value = 'ended';
    options.onRevoked?.();
  };

  /** The browser gave up (HTTP error such as 401, or a proxy 502): retry unless signed out. */
  const onGaveUp = () => {
    clearTimeout(watchdog);
    const check = options.checkSession;
    if (!check) {
      reconnectLater();
      return;
    }
    check().then(
      (alive) => {
        if (alive) reconnectLater();
        else end();
      },
      () => {
        reconnectLater();
      },
    );
  };

  function connect() {
    const mine = create(url);
    source = mine;
    arm();
    /** Listens on this connection only: a replaced one may still deliver a late event. */
    const on = (type: string, handle: (event: Event) => void) => {
      mine.addEventListener(type, (event) => {
        if (mine === source && !disposed && !ended) handle(event);
      });
    };
    on('open', arm);
    on('snapshot', (event) => {
      arm();
      status.value = 'live';
      attempt = 0;
      handlers.onSnapshot(parse(event) as S);
    });
    on('delta', (event) => {
      arm();
      handlers.onDelta(parse(event) as StreamDelta);
    });
    on('heartbeat', (event) => {
      const { intervalMs } = (parse(event) ?? {}) as { intervalMs?: unknown };
      if (typeof intervalMs === 'number' && intervalMs > 0) heartbeatMs = intervalMs;
      arm();
    });
    on('resync', () => {
      arm();
      status.value = 'reconnecting';
    });
    on('bye', reconnectLater);
    on('revoked', end);
    on('error', () => {
      status.value = 'reconnecting';
      if (mine.readyState === CLOSED) onGaveUp();
    });
  }

  connect();

  const close = () => {
    disposed = true;
    clearTimeout(watchdog);
    clearTimeout(retry);
    source?.close();
  };
  onScopeDispose(close);
  return { status, close };
};

/** Applies a versioned delta only when it is newer than what the client holds. */
export const isNewer = (current: number | undefined, incoming: number | undefined): boolean =>
  incoming !== undefined && (current === undefined || incoming > current);
