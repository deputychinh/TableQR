export interface SseMessage {
  event: string;
  data: Record<string, unknown>;
  at: number;
}

export interface SseClient {
  messages: SseMessage[];
  waitFor: (predicate: (m: SseMessage) => boolean, timeoutMs?: number) => Promise<SseMessage>;
  close: () => void;
  /** Resolves when the server ends the stream (not when the test aborts it). */
  ended: Promise<void>;
}

/** Minimal SSE reader over fetch streaming, for e2e tests against a listening app. */
export const openSse = async (url: string, cookie: string): Promise<SseClient> => {
  const controller = new AbortController();
  const response = await fetch(url, { headers: { cookie }, signal: controller.signal });
  if (!response.ok || !response.body) throw new Error(`SSE open failed: ${response.status}`);
  const messages: SseMessage[] = [];
  const waiters = new Set<() => void>();
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let markEnded: () => void = () => undefined;
  const ended = new Promise<void>((resolve) => {
    markEnded = resolve;
  });
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) {
          markEnded();
          return;
        }
        buffer += value;
        let index: number;
        while ((index = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          const event = /^event: (.*)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (event && data) {
            messages.push({
              event,
              data: JSON.parse(data) as Record<string, unknown>,
              at: performance.now(),
            });
            for (const wake of waiters) wake();
          }
        }
      }
    } catch {
      // aborted
    }
  })();
  const waitFor = (predicate: (m: SseMessage) => boolean, timeoutMs = 5000) =>
    new Promise<SseMessage>((resolve, reject) => {
      const check = () => {
        const found = messages.find(predicate);
        if (found) {
          waiters.delete(check);
          clearTimeout(timer);
          resolve(found);
        }
      };
      const timer = setTimeout(() => {
        waiters.delete(check);
        reject(new Error('SSE wait timed out'));
      }, timeoutMs);
      waiters.add(check);
      check();
    });
  return { messages, waitFor, close: () => controller.abort(), ended };
};
