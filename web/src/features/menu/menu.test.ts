import { ApiError } from '@/api/client';
import { jsonResponse } from '@/test/render';
import { describeMenuError } from './errors';
import { MAX_PRICE_VND, MIN_PRICE_VND, formatVnd, parsePrice, priceInputText } from './price';
import { menuRoutes } from './routes';
import type { StaffMenu } from './types';
import { useMenu } from './useMenu';

const NBSP = ' ';

describe('prices', () => {
  it('formats whole đồng the Vietnamese way', () => {
    expect(formatVnd(35_000).replace(NBSP, ' ')).toBe('35.000 ₫');
    expect(formatVnd(100_000_000).replace(NBSP, ' ')).toBe('100.000.000 ₫');
    expect(priceInputText(1_500_000)).toBe('1.500.000');
  });

  it.each([
    ['35000', { ok: true, value: 35_000 }],
    ['35.000', { ok: true, value: 35_000 }],
    [' 35 000 ₫', { ok: true, value: 35_000 }],
    ['1000', { ok: true, value: MIN_PRICE_VND }],
    ['100.000.000', { ok: true, value: MAX_PRICE_VND }],
    ['999', { ok: false, problem: 'too_small' }],
    ['0', { ok: false, problem: 'too_small' }],
    ['-5000', { ok: false, problem: 'too_small' }],
    ['100000001', { ok: false, problem: 'too_big' }],
    ['1.500.000', { ok: true, value: 1_500_000 }],
    ['35,5', { ok: false, problem: 'not_whole' }],
    ['65000.5', { ok: false, problem: 'not_whole' }],
    ['65.0005', { ok: false, problem: 'not_whole' }],
    ['1.5', { ok: false, problem: 'not_whole' }],
    ['35.00', { ok: false, problem: 'not_whole' }],
    ['3500.000', { ok: false, problem: 'not_whole' }],
    ['35..000', { ok: false, problem: 'not_whole' }],
    ['.500', { ok: false, problem: 'not_whole' }],
    ['35.000.', { ok: false, problem: 'not_whole' }],
    ['abc', { ok: false, problem: 'not_whole' }],
    ['  ', { ok: false, problem: 'empty' }],
  ])('reads "%s"', (input, expected) => {
    expect(parsePrice(input)).toEqual(expected);
  });
});

describe('describeMenuError', () => {
  const validation = (path: string, code: string) =>
    new ApiError(422, 'VALIDATION_FAILED', [{ path, code }]);

  it.each([
    ['priceVnd', 'too_small', 'menu.errors.priceTooSmall'],
    ['priceVnd', 'too_big', 'menu.errors.priceTooBig'],
    ['priceVnd', 'invalid_type', 'menu.errors.priceNotWhole'],
    ['description', 'too_big', 'menu.errors.description'],
    ['lateAfterMinutes', 'too_big', 'menu.errors.late'],
    ['categoryId', 'invalid_format', 'menu.errors.choose'],
    ['stationId', 'invalid_format', 'menu.errors.choose'],
  ])('maps %s/%s to %s', (path, code, key) => {
    expect(describeMenuError(validation(path, code), 'item').fields[path]?.key).toBe(key);
  });

  it('gives the name limit of each form', () => {
    expect(describeMenuError(validation('name', 'too_big'), 'item').fields.name).toEqual({
      key: 'menu.errors.name',
      params: { max: 80 },
    });
    expect(describeMenuError(validation('name', 'too_big'), 'station').fields.name?.params).toEqual(
      { max: 40 },
    );
  });

  it.each([
    ['CATEGORY_NOT_EMPTY', 'menu.errors.categoryNotEmpty'],
    ['STATION_NOT_EMPTY', 'menu.errors.stationNotEmpty'],
    ['LAST_STATION', 'menu.errors.lastStation'],
    ['NOT_FOUND', 'menu.errors.notFound'],
    ['FORBIDDEN', 'menu.errors.forbidden'],
    ['STATION_LIMIT_REACHED', 'menu.errors.stationLimit'],
    ['CATEGORY_LIMIT_REACHED', 'menu.errors.categoryLimit'],
    ['ITEM_LIMIT_REACHED', 'menu.errors.itemLimit'],
    ['NETWORK', 'errors.network'],
    ['SOMETHING_ELSE', 'errors.unexpected'],
  ])('maps %s to a form message', (code, key) => {
    expect(describeMenuError(new ApiError(409, code), 'category').form?.key).toBe(key);
  });

  it('puts a taken name under the name field', () => {
    expect(describeMenuError(new ApiError(409, 'NAME_TAKEN'), 'category').fields.name?.key).toBe(
      'menu.errors.nameTaken',
    );
  });

  it('falls back to a generic message for unknown fields and non-API errors', () => {
    expect(describeMenuError(validation('(body)', 'unrecognized_keys'), 'item').form?.key).toBe(
      'errors.unexpected',
    );
    expect(describeMenuError(new Error('boom'), 'item').form?.key).toBe('errors.unexpected');
  });
});

describe('useMenu', () => {
  afterEach(() => vi.unstubAllGlobals());

  const sample = (): StaffMenu => ({
    stations: [{ id: 's1', name: 'Bếp', lateAfterMinutes: 15 }],
    categories: [
      {
        id: 'c1',
        name: 'Món chính',
        isMain: true,
        sortOrder: 0,
        items: [
          {
            id: 'i1',
            categoryId: 'c1',
            stationId: 's1',
            name: 'Phở',
            priceVnd: 45_000,
            description: null,
            available: true,
          },
        ],
      },
      { id: 'c2', name: 'Đồ uống', isMain: false, sortOrder: 1, items: [] },
    ],
  });

  const loaded = async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(sample()))),
    );
    const state = useMenu();
    await state.load();
    return state;
  };

  it('loads the menu and counts items', async () => {
    const state = await loaded();
    expect(state.status.value).toBe('ready');
    expect(state.itemCount.value).toBe(1);
    expect(state.stationName('s1')).toBe('Bếp');
    expect(state.stationName('nope')).toBe('');
  });

  it('shows the error state when loading fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('offline'))),
    );
    const state = useMenu();
    await state.load();
    expect(state.status.value).toBe('error');
  });

  it('moves a saved item to its new category and replaces it in place otherwise', async () => {
    const state = await loaded();
    const item = state.categories.value[0]?.items[0];
    if (!item) throw new Error('fixture');
    state.putItem({ ...item, name: 'Phở bò' });
    expect(state.categories.value[0]?.items[0]?.name).toBe('Phở bò');
    state.putItem({ ...item, categoryId: 'c2' });
    expect(state.categories.value[0]?.items).toEqual([]);
    expect(state.categories.value[1]?.items.map((i) => i.id)).toEqual(['i1']);
    state.removeItem('i1');
    expect(state.itemCount.value).toBe(0);
  });

  it('adds, renames, reorders and removes categories and stations', async () => {
    const state = await loaded();
    state.putCategory({ id: 'c3', name: 'Tráng miệng', isMain: false, sortOrder: 2 });
    state.putCategory({ id: 'c1', name: 'Món ăn', isMain: true, sortOrder: 0 });
    state.orderCategories([
      { id: 'c3', name: 'Tráng miệng', isMain: false, sortOrder: 0 },
      { id: 'c1', name: 'Món ăn', isMain: true, sortOrder: 1 },
      { id: 'c2', name: 'Đồ uống', isMain: false, sortOrder: 2 },
    ]);
    expect(state.categories.value.map((c) => c.name)).toEqual(['Tráng miệng', 'Món ăn', 'Đồ uống']);
    expect(state.categories.value[1]?.items).toHaveLength(1);
    state.removeCategory('c3');
    expect(state.categories.value).toHaveLength(2);

    state.putStation({ id: 's2', name: 'Bar', lateAfterMinutes: 5 });
    state.putStation({ id: 's1', name: 'Bếp nóng', lateAfterMinutes: 10 });
    expect(state.stations.value.map((s) => s.name)).toEqual(['Bếp nóng', 'Bar']);
    state.removeStation('s2');
    expect(state.stations.value).toHaveLength(1);
  });

  it('flips availability at once and rolls it back when the call fails', async () => {
    const state = await loaded();
    const item = state.categories.value[0]?.items[0];
    if (!item) throw new Error('fixture');
    let resolveCall: (r: Response) => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => (resolveCall = resolve))),
    );
    const pending = state.setAvailability(item, false);
    expect(item.available).toBe(false);
    resolveCall(jsonResponse({ code: 'INTERNAL' }, 500));
    await expect(pending).rejects.toBeInstanceOf(ApiError);
    expect(item.available).toBe(true);
  });

  it('ignores local updates before the menu is loaded', () => {
    const state = useMenu();
    state.putCategory({ id: 'c', name: 'X', isMain: false, sortOrder: 0 });
    state.orderCategories([]);
    state.removeCategory('c');
    state.putStation({ id: 's', name: 'X', lateAfterMinutes: 1 });
    state.removeStation('s');
    expect(state.menu.value).toBeNull();
  });
});

describe('menu routes', () => {
  it('are staff pages', () => {
    expect(menuRoutes.map((r) => [r.path, r.meta?.staff])).toEqual([
      ['/quan-ly/thuc-don', true],
      ['/quan-ly/thuc-don/xem-truoc', true],
    ]);
  });
});
