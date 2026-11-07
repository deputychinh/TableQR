import {
  MAX_PAYLOAD_BYTES,
  decodeEvent,
  encodeEvent,
  formatSse,
  reconnectDelayMs,
} from './event.js';

const event = {
  restaurantId: 'r1',
  topic: 'floor',
  type: 'item.status',
  data: { itemId: 'i1', status: 'done', version: 3 },
};

describe('realtime event codec', () => {
  it('round-trips an event', () => {
    expect(decodeEvent(encodeEvent(event))).toEqual(event);
  });

  it('refuses payloads NOTIFY cannot carry', () => {
    expect(() => encodeEvent({ ...event, data: { blob: 'x'.repeat(MAX_PAYLOAD_BYTES) } })).toThrow(
      /too large/,
    );
  });

  it.each([
    undefined,
    '',
    'not json',
    '[]',
    '{"restaurantId":1}',
    '{"restaurantId":"r","topic":"t","type":"x","data":[]}',
  ])('drops malformed payload %s', (payload) => {
    expect(decodeEvent(payload)).toBeUndefined();
  });
});

describe('formatSse', () => {
  it('writes event, optional id and JSON data lines', () => {
    expect(formatSse('delta', { a: 1 })).toBe('event: delta\ndata: {"a":1}\n\n');
    expect(formatSse('delta', { a: 1 }, '7')).toBe('id: 7\nevent: delta\ndata: {"a":1}\n\n');
  });
});

describe('reconnectDelayMs', () => {
  it('backs off exponentially with jitter and caps at 10 s', () => {
    expect(reconnectDelayMs(0, () => 0)).toBe(250);
    expect(reconnectDelayMs(0, () => 1)).toBe(500);
    expect(reconnectDelayMs(3, () => 1)).toBe(4000);
    expect(reconnectDelayMs(20, () => 1)).toBe(10_000);
    expect(reconnectDelayMs(20, () => 0)).toBe(5000);
  });
});
