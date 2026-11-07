import type { Request, Response } from 'express';
import type { RealtimeHub } from './realtime.hub.js';
import { formatSse, type RealtimeEvent } from './domain/event.js';

export const HEARTBEAT_MS = 15_000;

export interface StreamOptions<S> {
  restaurantId: string;
  topics: string[];
  /** Current truth for this audience; sent on open and after every `resync`. */
  snapshot: () => Promise<S>;
  heartbeatMs?: number;
}

/**
 * Opens an SSE stream: `snapshot` first, then `delta` events for the subscribed topics, a heartbeat
 * comment every 15 s, and a fresh snapshot after the hub reconnects. Subscribes before reading the
 * snapshot so no change between the two is lost (the client ignores deltas older than its state).
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
    } catch {
      write(formatSse('error', { code: 'SNAPSHOT_FAILED' }));
    }
  };

  const unsubscribe = hub.subscribe(
    options.restaurantId,
    options.topics,
    (event: RealtimeEvent | 'resync') => {
      if (event === 'resync') {
        write(formatSse('resync', {}));
        void sendSnapshot();
      } else {
        write(formatSse('delta', { topic: event.topic, type: event.type, ...event.data }));
      }
    },
  );
  const heartbeat = setInterval(() => write(': ping\n\n'), options.heartbeatMs ?? HEARTBEAT_MS);
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    unsubscribe();
  };
  request.on('close', close);
  response.on('close', close);
  await sendSnapshot();
};
