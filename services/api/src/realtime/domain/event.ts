/** A realtime event (ADR 0004). Payloads carry ids and statuses, never documents or personal data. */
export interface RealtimeEvent {
  restaurantId: string;
  /** e.g. `station:<id>`, `floor`, `session:<id>` */
  topic: string;
  type: string;
  data: Readonly<Record<string, string | number | boolean | null>>;
}

export const NOTIFY_CHANNEL = 'tqr';
/** Postgres NOTIFY payloads must stay under 8000 bytes. */
export const MAX_PAYLOAD_BYTES = 7900;

export const encodeEvent = (event: RealtimeEvent): string => {
  const json = JSON.stringify(event);
  if (Buffer.byteLength(json) > MAX_PAYLOAD_BYTES) {
    throw new Error(`realtime event too large for NOTIFY (${event.type})`);
  }
  return json;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Parses a NOTIFY payload; anything malformed is dropped (returns undefined). */
export const decodeEvent = (payload: string | undefined): RealtimeEvent | undefined => {
  if (!payload) return undefined;
  try {
    const value: unknown = JSON.parse(payload);
    if (
      isRecord(value) &&
      typeof value.restaurantId === 'string' &&
      typeof value.topic === 'string' &&
      typeof value.type === 'string' &&
      isRecord(value.data)
    ) {
      return value as unknown as RealtimeEvent;
    }
  } catch {
    // malformed payload: ignored by design, the next snapshot repairs any client
  }
  return undefined;
};

/** Server-Sent Events wire format for one event. */
export const formatSse = (event: string, data: unknown, id?: string): string =>
  `${id === undefined ? '' : `id: ${id}\n`}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

export const reconnectDelayMs = (attempt: number, random: () => number = Math.random): number => {
  const base = Math.min(10_000, 500 * 2 ** attempt);
  return Math.round(base / 2 + random() * (base / 2));
};
