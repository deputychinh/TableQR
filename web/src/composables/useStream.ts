import { onScopeDispose, ref, shallowRef } from 'vue';

export type StreamStatus = 'connecting' | 'live' | 'reconnecting';

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

/**
 * Subscribes to a server-sent event stream (ADR 0004). The browser reconnects by itself; every
 * (re)connect starts with a snapshot, so missed deltas never leave the screen stale.
 */
export const useStream = <S>(
  url: string,
  handlers: StreamHandlers<S>,
  create: EventSourceFactory = (u) => new EventSource(u, { withCredentials: true }),
) => {
  const status = ref<StreamStatus>('connecting');
  const source = shallowRef<EventSource>(create(url));

  const parse = (event: Event): unknown => JSON.parse((event as MessageEvent<string>).data);

  source.value.addEventListener('snapshot', (event) => {
    status.value = 'live';
    handlers.onSnapshot(parse(event) as S);
  });
  source.value.addEventListener('delta', (event) => {
    handlers.onDelta(parse(event) as StreamDelta);
  });
  source.value.addEventListener('resync', () => {
    status.value = 'reconnecting';
  });
  source.value.addEventListener('error', () => {
    status.value = 'reconnecting';
  });

  const close = () => source.value.close();
  onScopeDispose(close);
  return { status, close };
};

/** Applies a versioned delta only when it is newer than what the client holds. */
export const isNewer = (current: number | undefined, incoming: number | undefined): boolean =>
  incoming !== undefined && (current === undefined || incoming > current);
