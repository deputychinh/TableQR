import { createItemSchema, createStationSchema, priceVnd } from '../dto/menu.dto.js';
import { groupMenu, toGuestMenu, type ItemRow } from './menu-tree.js';
import { normalizeName } from './names.js';
import { nextSortOrder, swapForMove } from './ordering.js';
import { MAX_PRICE_VND, MIN_PRICE_VND } from './price.js';
import {
  MAX_CATEGORIES_PER_RESTAURANT,
  MAX_ITEMS_PER_RESTAURANT,
  MAX_STATIONS_PER_RESTAURANT,
  isAtLimit,
} from './limits.js';

describe('menu caps', () => {
  it('keeps the caps the review set and is at the limit only once the count reaches it', () => {
    expect([
      MAX_STATIONS_PER_RESTAURANT,
      MAX_CATEGORIES_PER_RESTAURANT,
      MAX_ITEMS_PER_RESTAURANT,
    ]).toEqual([20, 50, 500]);
    expect(isAtLimit(499, MAX_ITEMS_PER_RESTAURANT)).toBe(false);
    expect(isAtLimit(500, MAX_ITEMS_PER_RESTAURANT)).toBe(true);
  });
});

describe('price rule (AC7)', () => {
  it('keeps the limits the spec names', () => {
    expect([MIN_PRICE_VND, MAX_PRICE_VND]).toEqual([1000, 100_000_000]);
  });

  it.each([
    [999, 'too_small'],
    [1000, undefined],
    [100_000_000, undefined],
    [100_000_001, 'too_big'],
    [1500.5, 'invalid_type'],
    [0, 'too_small'],
    [-5000, 'too_small'],
    [Number.NaN, 'invalid_type'],
    ['35000', 'invalid_type'],
  ])('the request schema answers %s with %s', (value, code) => {
    const result = priceVnd.safeParse(value);
    expect(result.error?.issues[0]?.code).toBe(code);
  });
});

describe('request schemas', () => {
  const item = {
    name: '  Phở   bò ',
    priceVnd: 45_000,
    categoryId: '00000000-0000-4000-8000-000000000001',
    stationId: '00000000-0000-4000-8000-000000000002',
  };

  it('normalises names and turns an empty description into null', () => {
    const parsed = createItemSchema.parse({ ...item, description: '   ' });
    expect(parsed.name).toBe('Phở bò');
    expect(parsed.description).toBeNull();
  });

  it.each([
    ['blank name', { name: '   ' }, 'name'],
    ['81-char name', { name: 'a'.repeat(81) }, 'name'],
    ['201-char description', { description: 'a'.repeat(201) }, 'description'],
    ['foreign field', { restaurantId: item.categoryId }, ''],
  ])('refuses a %s', (_label, patch, path) => {
    const result = createItemSchema.safeParse({ ...item, ...patch });
    expect(result.error?.issues.map((i) => i.path.join('.'))).toContain(path);
  });

  it('accepts an 80-char name and a 200-char description', () => {
    const result = createItemSchema.safeParse({
      ...item,
      name: 'a'.repeat(80),
      description: 'b'.repeat(200),
    });
    expect(result.success).toBe(true);
  });

  it.each([
    [0, false],
    [1, true],
    [120, true],
    [121, false],
  ])('a station late after %s minutes is valid: %s', (minutes, ok) => {
    expect(createStationSchema.safeParse({ name: 'Bar', lateAfterMinutes: minutes }).success).toBe(
      ok,
    );
  });

  it('limits station names to 40 characters', () => {
    expect(createStationSchema.safeParse({ name: 'a'.repeat(40) }).success).toBe(true);
    expect(createStationSchema.safeParse({ name: 'a'.repeat(41) }).success).toBe(false);
  });
});

describe('normalizeName', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeName('  Bếp \t nóng  ')).toBe('Bếp nóng');
  });
});

describe('category ordering', () => {
  const rows = [
    { id: 'c', sortOrder: 2 },
    { id: 'a', sortOrder: 0 },
    { id: 'b', sortOrder: 1 },
  ];

  it('swaps with the neighbour above or below', () => {
    expect(swapForMove(rows, 'b', 'up')).toEqual({ moved: rows[2], other: rows[1] });
    expect(swapForMove(rows, 'b', 'down')).toEqual({ moved: rows[2], other: rows[0] });
  });

  it('does nothing at either end or for an unknown id', () => {
    expect(swapForMove(rows, 'a', 'up')).toBeNull();
    expect(swapForMove(rows, 'c', 'down')).toBeNull();
    expect(swapForMove(rows, 'zzz', 'up')).toBeNull();
  });

  it('appends after the highest sort order', () => {
    expect(nextSortOrder(rows)).toBe(3);
    expect(nextSortOrder([])).toBe(0);
  });
});

describe('menu tree', () => {
  const categories = [
    { id: 'drinks', name: 'Đồ uống', isMain: false, sortOrder: 1 },
    { id: 'mains', name: 'Món chính', isMain: true, sortOrder: 0 },
    { id: 'empty', name: 'Tráng miệng', isMain: false, sortOrder: 2 },
  ];
  const item = (id: string, categoryId: string, available = true): ItemRow => ({
    id,
    categoryId,
    stationId: 's1',
    name: id,
    priceVnd: 30_000,
    description: null,
    available,
  });
  const items = [item('pho', 'mains'), item('tra-da', 'drinks', false), item('bun', 'mains')];

  it('groups items under categories in the owner’s order, keeping empty categories for staff', () => {
    const tree = groupMenu(categories, items);
    expect(tree.map((c) => c.id)).toEqual(['mains', 'drinks', 'empty']);
    expect(tree[0]?.items.map((i) => i.id)).toEqual(['pho', 'bun']);
    expect(tree[2]?.items).toEqual([]);
  });

  it('shows guests "hết món" items as not orderable, hides empty categories and stations (AC5, AC6)', () => {
    const guest = toGuestMenu(groupMenu(categories, items));
    expect(guest.map((c) => c.id)).toEqual(['mains', 'drinks']);
    expect(guest[1]?.items[0]).toEqual({
      id: 'tra-da',
      name: 'tra-da',
      priceVnd: 30_000,
      description: null,
      orderable: false,
    });
    expect(JSON.stringify(guest)).not.toContain('stationId');
  });
});
