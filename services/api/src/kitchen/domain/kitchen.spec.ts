import { doneSchema, versionSchema } from '../dto/kitchen.dto.js';
import { ITEM_STATUSES, nextStatus, type ItemStatus } from './item-status.js';
import { isLate, lateAt } from './late.js';
import {
  QUEUE_ORDER_COLUMNS,
  compareQueueItems,
  findSkippedOlder,
  type QueueCandidate,
  type QueueKey,
} from './queue.js';
import { buildReadyBoard, type FloorItemRow } from './ready-board.js';
import { prng } from '../../../test/support/random.js';

const key = (queueAtUs: number, sessionOpenedAtUs: number, seq: number): QueueKey => ({
  queueAtUs,
  sessionOpenedAtUs,
  seq,
});

describe('compareQueueItems (AC30, ADR 0005)', () => {
  it('puts the earlier release time first', () => {
    expect(compareQueueItems(key(1, 9, 9), key(2, 1, 1))).toBeLessThan(0);
    expect(compareQueueItems(key(2, 1, 1), key(1, 9, 9))).toBeGreaterThan(0);
  });

  it('breaks a release-time tie by table arrival time', () => {
    expect(compareQueueItems(key(5, 1, 9), key(5, 2, 1))).toBeLessThan(0);
  });

  it('breaks a release and arrival tie by line order (seq)', () => {
    expect(compareQueueItems(key(5, 3, 1), key(5, 3, 2))).toBeLessThan(0);
    expect(compareQueueItems(key(5, 3, 2), key(5, 3, 2))).toBe(0);
  });

  it('tells apart times less than a millisecond apart (Postgres keeps microseconds)', () => {
    expect(compareQueueItems(key(1_000_001, 0, 9), key(1_000_002, 0, 1))).toBeLessThan(0);
  });

  it('names the same columns the SQL orders by', () => {
    expect(QUEUE_ORDER_COLUMNS).toEqual(['queue_at', 'session_opened_at', 'seq']);
  });

  it('is a total order on random keys with many ties (property, 500 runs)', () => {
    const random = prng(42);
    const pick = () => Math.floor(random() * 3);
    for (let run = 0; run < 500; run += 1) {
      const items = Array.from({ length: 6 }, (_, i) => key(pick(), pick(), i));
      const sorted = [...items].sort(compareQueueItems);
      for (let i = 1; i < sorted.length; i += 1) {
        const [a, b] = [sorted[i - 1], sorted[i]] as [QueueKey, QueueKey];
        expect(compareQueueItems(a, b)).toBeLessThan(0);
        expect(compareQueueItems(b, a)).toBeGreaterThan(0);
        expect(
          a.queueAtUs < b.queueAtUs ||
            (a.queueAtUs === b.queueAtUs && a.sessionOpenedAtUs < b.sessionOpenedAtUs) ||
            (a.queueAtUs === b.queueAtUs &&
              a.sessionOpenedAtUs === b.sessionOpenedAtUs &&
              a.seq < b.seq),
        ).toBe(true);
      }
    }
  });
});

describe('findSkippedOlder (AC32)', () => {
  const item = (
    id: string,
    over: Partial<QueueCandidate> & { queueAtUs: number },
  ): QueueCandidate => ({
    id,
    stationId: 's1',
    menuItemId: 'pho',
    status: 'waiting',
    sessionOpenedAtUs: 0,
    seq: Number(id.replace(/\D/g, '')) || 0,
    ...over,
  });

  const target = item('i5', { queueAtUs: 50, status: 'cooking' });

  it('finds an older waiting or cooking item of the same dish at the same station', () => {
    const older = [item('i1', { queueAtUs: 10 }), item('i2', { queueAtUs: 20, status: 'cooking' })];
    expect(findSkippedOlder(target, [target, ...older]).map((i) => i.id)).toEqual(['i1', 'i2']);
  });

  it('ignores a different dish, another station, younger items and finished ones', () => {
    const others = [
      item('i1', { queueAtUs: 10, menuItemId: 'tra-da' }),
      item('i2', { queueAtUs: 10, stationId: 's2' }),
      item('i6', { queueAtUs: 60 }),
      item('i3', { queueAtUs: 10, status: 'done' }),
      item('i4', { queueAtUs: 10, status: 'cancelled' }),
      item('i7', { queueAtUs: 10, status: 'pending' }),
    ];
    expect(findSkippedOlder(target, [target, ...others])).toEqual([]);
  });

  it('uses the full queue order: same release time, earlier table counts as older', () => {
    const earlierTable = item('i9', { queueAtUs: 50, sessionOpenedAtUs: -1 });
    const laterLine = item('i8', { queueAtUs: 50, sessionOpenedAtUs: 0, seq: 99 });
    expect(findSkippedOlder(target, [earlierTable, laterLine]).map((i) => i.id)).toEqual(['i9']);
  });
});

describe('late threshold (AC33)', () => {
  const queueAt = new Date('2026-11-08T10:00:00.000Z');
  const at = (ms: number) => new Date(queueAt.getTime() + ms);

  it.each([
    [15 * 60_000 - 1, false],
    [15 * 60_000, false],
    [15 * 60_000 + 1, true],
    [-60_000, false],
  ])('after %i ms with a 15-minute threshold late is %s', (elapsed, late) => {
    expect(isLate(queueAt, 15, at(elapsed))).toBe(late);
  });

  it('gives the instant the item turns late', () => {
    expect(lateAt(queueAt, 1).toISOString()).toBe('2026-11-08T10:01:00.000Z');
  });
});

describe('item status transitions (ADR 0005 §4)', () => {
  const legal: [ItemStatus, 'start' | 'done' | 'serve', ItemStatus][] = [
    ['waiting', 'start', 'cooking'],
    ['cooking', 'done', 'done'],
    ['done', 'serve', 'served'],
  ];

  it.each(legal)('%s --%s--> %s', (from, action, to) => {
    expect(nextStatus(from, action)).toBe(to);
  });

  it('refuses every other move, including cooking a cancelled or pending item', () => {
    for (const status of ITEM_STATUSES) {
      for (const action of ['start', 'done', 'serve'] as const) {
        const allowed = legal.some(([from, a]) => from === status && a === action);
        expect(nextStatus(status, action) !== undefined).toBe(allowed);
      }
    }
    expect(nextStatus('cancelled', 'start')).toBeUndefined();
    expect(nextStatus('waiting', 'done')).toBeUndefined();
    expect(nextStatus('served', 'serve')).toBeUndefined();
  });
});

describe('request schemas', () => {
  it('needs a positive whole version', () => {
    expect(versionSchema.safeParse({ version: 3 }).success).toBe(true);
    expect(versionSchema.safeParse({ version: 0 }).success).toBe(false);
    expect(versionSchema.safeParse({ version: 1.5 }).success).toBe(false);
    expect(versionSchema.safeParse({ version: 1, extra: true }).success).toBe(false);
  });

  it('trims the skip reason, treats blank as none and caps it at 140 characters', () => {
    expect(doneSchema.parse({ version: 1, skipReason: '  Bàn 5 gọi gấp ' }).skipReason).toBe(
      'Bàn 5 gọi gấp',
    );
    expect(doneSchema.parse({ version: 1, skipReason: '   ' }).skipReason).toBeUndefined();
    expect(doneSchema.parse({ version: 1 }).skipReason).toBeUndefined();
    expect(doneSchema.safeParse({ version: 1, skipReason: 'x'.repeat(141) }).success).toBe(false);
    expect(doneSchema.safeParse({ version: 1, skipReason: 'x'.repeat(140) }).success).toBe(true);
  });
});

describe('buildReadyBoard (AC35, AC37)', () => {
  const t0 = new Date('2026-11-08T10:00:00.000Z').getTime();
  let seq = 0;
  const row = (
    sessionId: string,
    status: ItemStatus,
    doneMinute: number | null = null,
    over: Partial<FloorItemRow> = {},
  ): FloorItemRow => {
    seq += 1;
    return {
      id: `i${String(seq)}`,
      version: 2,
      seq,
      sessionId,
      tableName: `Bàn ${sessionId}`,
      partySize: 2,
      sessionOpenedAt: new Date(t0),
      name: 'Phở bò',
      quantity: 1,
      note: null,
      status,
      doneAt: doneMinute === null ? null : new Date(t0 + doneMinute * 60_000),
      ...over,
    };
  };

  it('lists ready dishes under their table, the table ready longest first', () => {
    const board = buildReadyBoard([
      row('B', 'done', 5),
      row('A', 'done', 9),
      row('A', 'done', 2),
      row('A', 'cooking'),
    ]);
    expect(board.tables.map((t) => t.tableName)).toEqual(['Bàn A', 'Bàn B']);
    const [a] = board.tables;
    expect(a?.ready.map((i) => i.doneAt)).toEqual([
      new Date(t0 + 2 * 60_000).toISOString(),
      new Date(t0 + 9 * 60_000).toISOString(),
    ]);
    expect(a?.remaining).toBe(1);
    expect(a?.complete).toBe(false);
  });

  it('marks a table "Đủ món" when every item is served or cancelled', () => {
    const board = buildReadyBoard([
      row('A', 'served'),
      row('A', 'cancelled'),
      row('B', 'served'),
      row('B', 'pending'),
      row('C', 'cancelled'),
      row('D', 'waiting', null, { sessionOpenedAt: new Date(t0 - 1) }),
    ]);
    expect(board.tables.map((t) => [t.tableName, t.complete])).toEqual([
      ['Bàn D', false],
      ['Bàn B', false],
      ['Bàn A', true],
    ]);
  });

  it('is empty without items', () => {
    expect(buildReadyBoard([])).toEqual({ tables: [] });
  });
});
