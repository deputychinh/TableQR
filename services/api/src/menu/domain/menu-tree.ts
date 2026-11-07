import { sortBySortOrder } from './ordering.js';

export interface CategoryRow {
  id: string;
  name: string;
  isMain: boolean;
  sortOrder: number;
}

export interface ItemRow {
  id: string;
  categoryId: string;
  stationId: string;
  name: string;
  priceVnd: number;
  description: string | null;
  available: boolean;
}

export type CategoryWithItems<I> = CategoryRow & { items: I[] };

/** Groups items (already in display order) under their categories, categories in the owner's order. */
export const groupMenu = <I extends ItemRow>(
  categoryRows: readonly CategoryRow[],
  itemRows: readonly I[],
): CategoryWithItems<I>[] => {
  const byCategory = new Map<string, I[]>();
  for (const item of itemRows) {
    const list = byCategory.get(item.categoryId) ?? [];
    list.push(item);
    byCategory.set(item.categoryId, list);
  }
  return sortBySortOrder(categoryRows).map((category) => ({
    ...category,
    items: byCategory.get(category.id) ?? [],
  }));
};

export interface GuestItem {
  id: string;
  name: string;
  priceVnd: number;
  description: string | null;
  /** AC6: "hết món" items stay visible but cannot be ordered. */
  orderable: boolean;
}

export interface GuestCategory {
  id: string;
  name: string;
  isMain: boolean;
  items: GuestItem[];
}

/** The guest's view: no station or other internal fields, empty categories left out (AC5, AC6). */
export const toGuestMenu = (tree: readonly CategoryWithItems<ItemRow>[]): GuestCategory[] =>
  tree
    .filter((category) => category.items.length > 0)
    .map((category) => ({
      id: category.id,
      name: category.name,
      isMain: category.isMain,
      items: category.items.map((item) => ({
        id: item.id,
        name: item.name,
        priceVnd: item.priceVnd,
        description: item.description,
        orderable: item.available,
      })),
    }));
