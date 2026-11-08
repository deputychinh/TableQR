import type { Request, Response } from 'express';
import type { RealtimeHub } from './realtime.hub.js';
import { formatSse, type RealtimeEvent } from './domain/event.js';

export const HEARTBEAT_MS = 15_000;

/** Who the stream belongs to, so it can end when their access ends (D4). */
export interface StreamAudience {
  /** The staff member behind the stream; undefined for guests (closed only restaurant-wide). */
  userId: string | undefined;
  /** Re-checked on every heartbeat (backstop for a missed revocation); false ends the stream. */
  isStillAllowed: () => Promise<boolean>;
}

export interface StreamOptions<S> {
  restaurantId: string;
  topics: string[];
  /** Current truth for this audience; sent on open and after every `resync`. */
  snapshot: () => Promise<S>;
  audience: StreamAudience;
  heartbeatMs?: number;
  /**
   * Aborted when the server shuts down (TQR-032): the stream says `bye` and ends, so closing the
   * HTTP server never waits for a browser (or a proxy) that keeps the connection open.
   */
  stop?: AbortSignal;
  /** Called once when the stream closes for any reason. */
  onClose?: () => void;
  /**
   * Told when a snapshot fails (the client gets `error` and keeps its previous state) or a
   * heartbeat session check fails (the stream stays; the next beat checks again).
   */
  onError?: (what: 'snapshot' | 'session_check', error: unknown) => void;
}

/**
 * Opens an SSE stream: `snapshot` first, then `delta` events for the subscribed topics, a
 * `heartbeat` event (`{intervalMs}`) right after the first snapshot and then every `heartbeatMs`
 * (TQR-031: a named event, because EventSource never surfaces comments, so the client can tell a
 * silently dead stream from a quiet one), and a fresh snapshot after the hub reconnects. Subscribes
 * before reading the snapshot so no change between the two is lost (the client ignores deltas older
 * than its state). A revocation for the audience, or a heartbeat that finds the session gone, sends
 * `revoked` and ends the response; the browser's reconnect then meets the guard (401/403). Server
 * shutdown (`stop`) sends `bye` and ends it (TQR-032).
 */
export const openStream = async <S>(
  hub: RealtimeHub,
  request: Request,
  response: Response,
  options: StreamOptions<S>,
): Promise<void> => {
  response.status(200);
  response.setHeader('content-type', 'text/event-stream; charset=utf-8');
  response.setHeader('cache-control', 'no-cache, no-transform');
  response.setHeader('connection', 'keep-alive');
  response.setHeader('x-accel-buffering', 'no');
  response.flushHeaders();

  let closed = false;
  const write = (chunk: string) => {
    if (!closed) response.write(chunk);
  };
  const sendSnapshot = async () => {
    try {
      write(formatSse('snapshot', await options.snapshot()));
    } catch (error: unknown) {
      options.onError?.('snapshot', error);
      write(formatSse('error', { code: 'SNAPSHOT_FAILED' }));
    }
  };

  let unsubscribe: () => void = () => undefined;
  let heartbeat: NodeJS.Timeout | undefined;
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    options.stop?.removeEventListener('abort', bye);
    unsubscribe();
    options.onClose?.();
  };
  const end = (event: 'revoked' | 'bye' = 'revoked') => {
    if (closed) return;
    write(formatSse(event, {}));
    close();
    response.end();
  };
  const bye = () => {
    end('bye');
  };
  if (options.stop?.aborted) {
    bye();
    return;
  }
  options.stop?.addEventListener('abort', bye, { once: true });
  const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
  const beat = () => {
    write(formatSse('heartbeat', { intervalMs: heartbeatMs }));
  };

  unsubscribe = hub.subscribe(
    options.restaurantId,
    options.topics,
    (event: RealtimeEvent | 'resync' | 'revoked') => {
      if (event === 'revoked') {
        end();
      } else if (event === 'resync') {
        write(formatSse('resync', {}));
        void sendSnapshot();
      } else {
        write(formatSse('delta', { topic: event.topic, type: event.type, ...event.data }));
      }
    },
    options.audience.userId,
  );
  heartbeat = setInterval(() => {
    beat();
    options.audience.isStillAllowed().then(
      (allowed) => {
        if (!allowed) end();
      },
      (error: unknown) => options.onError?.('session_check', error),
    );
  }, heartbeatMs);
  request.on('close', close);
  response.on('close', close);
  await sendSnapshot();
  beat();
};
