import { computed, ref } from 'vue';
import { menuApi } from './api';
import type { Category, MenuItem, StaffMenu, Station } from './types';

export type LoadStatus = 'loading' | 'error' | 'ready';

/** Server state of the owner's menu screen, with local updates after each successful call. */
export const useMenu = () => {
  const menu = ref<StaffMenu | null>(null);
  const status = ref<LoadStatus>('loading');

  const load = async (): Promise<void> => {
    status.value = 'loading';
    try {
      menu.value = await menuApi.load();
      status.value = 'ready';
    } catch {
      // The error state offers "Thử lại"; the cause is in the network panel and API logs.
      status.value = 'error';
    }
  };

  const stations = computed<Station[]>(() => menu.value?.stations ?? []);
  const categories = computed(() => menu.value?.categories ?? []);
  const itemCount = computed(() =>
    categories.value.reduce((sum, category) => sum + category.items.length, 0),
  );
  const stationName = (id: string): string => stations.value.find((s) => s.id === id)?.name ?? '';

  /** Puts a saved item in its (possibly new) category, keeping its place when it stays. */
  const putItem = (saved: MenuItem): void => {
    for (const category of categories.value) {
      const index = category.items.findIndex((item) => item.id === saved.id);
      if (index === -1) continue;
      if (category.id === saved.categoryId) {
        category.items.splice(index, 1, saved);
        return;
      }
      category.items.splice(index, 1);
    }
    categories.value.find((c) => c.id === saved.categoryId)?.items.push(saved);
  };

  const removeItem = (id: string): void => {
    for (const category of categories.value) {
      const index = category.items.findIndex((item) => item.id === id);
      if (index !== -1) category.items.splice(index, 1);
    }
  };

  const putCategory = (saved: Category): void => {
    if (!menu.value) return;
    const existing = menu.value.categories.find((c) => c.id === saved.id);
    if (existing) Object.assign(existing, saved);
    else menu.value.categories.push({ ...saved, items: [] });
  };

  const orderCategories = (order: Category[]): void => {
    if (!menu.value) return;
    const byId = new Map(menu.value.categories.map((c) => [c.id, c]));
    menu.value.categories = order.flatMap((c) => {
      const current = byId.get(c.id);
      return current ? [{ ...current, sortOrder: c.sortOrder }] : [];
    });
  };

  const removeCategory = (id: string): void => {
    if (!menu.value) return;
    menu.value.categories = menu.value.categories.filter((c) => c.id !== id);
  };

  const putStation = (saved: Station): void => {
    if (!menu.value) return;
    const existing = menu.value.stations.find((s) => s.id === saved.id);
    if (existing) Object.assign(existing, saved);
    else menu.value.stations.push(saved);
  };

  const removeStation = (id: string): void => {
    if (!menu.value) return;
    menu.value.stations = menu.value.stations.filter((s) => s.id !== id);
  };

  /** Optimistic: the switch moves at once; on failure it moves back and the error is rethrown. */
  const setAvailability = async (item: MenuItem, available: boolean): Promise<void> => {
    const before = item.available;
    item.available = available;
    try {
      const saved = await menuApi.setAvailability(item.id, available);
      item.available = saved.available;
    } catch (error: unknown) {
      item.available = before;
      throw error;
    }
  };

  return {
    menu,
    status,
    stations,
    categories,
    itemCount,
    load,
    stationName,
    putItem,
    removeItem,
    putCategory,
    orderCategories,
    removeCategory,
    putStation,
    removeStation,
    setAvailability,
  };
};

export type MenuState = ReturnType<typeof useMenu>;
