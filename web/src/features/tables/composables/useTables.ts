import { computed, ref } from 'vue';
import {
  createTable,
  deleteTable,
  listTables,
  rotateTableQr,
  updateTable,
  type TableInput,
  type TableItem,
} from '../api';
import { byTableName } from '../qr';

export type LoadStatus = 'loading' | 'ready' | 'error';

/** The restaurant's tables, kept sorted by name; every write updates the list in place. */
export const useTables = () => {
  const items = ref<TableItem[]>([]);
  const status = ref<LoadStatus>('loading');
  const sorted = computed(() => [...items.value].sort(byTableName));

  const load = async (): Promise<void> => {
    status.value = 'loading';
    try {
      items.value = await listTables();
      status.value = 'ready';
    } catch {
      // The page shows ErrorState with a retry; the cause is visible in the network panel.
      status.value = 'error';
    }
  };

  const replace = (table: TableItem) => {
    items.value = items.value.map((item) => (item.id === table.id ? table : item));
  };

  const add = async (input: TableInput): Promise<TableItem> => {
    const table = await createTable(input);
    items.value = [...items.value, table];
    return table;
  };

  const update = async (id: string, input: TableInput): Promise<TableItem> => {
    const table = await updateTable(id, input);
    replace(table);
    return table;
  };

  const rotate = async (id: string): Promise<TableItem> => {
    const table = await rotateTableQr(id);
    replace(table);
    return table;
  };

  const remove = async (id: string): Promise<void> => {
    await deleteTable(id);
    items.value = items.value.filter((item) => item.id !== id);
  };

  return { items: sorted, status, load, add, update, rotate, remove };
};
