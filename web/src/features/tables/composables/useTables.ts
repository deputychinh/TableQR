import { computed, ref } from 'vue';
import {
  archiveTable,
  createTable,
  deleteTable,
  listTables,
  rotateTableQr,
  unarchiveTable,
  updateTable,
  type TableInput,
  type TableItem,
} from '../api';
import { byTableName } from '../qr';

export type LoadStatus = 'loading' | 'ready' | 'error';

/**
 * The restaurant's tables, kept sorted by name; every write updates the list in place. Hidden
 * tables (TQR-024) live apart in `archived`: never printed, shown only in "Bàn đã ẩn".
 */
export const useTables = () => {
  const items = ref<TableItem[]>([]);
  const hidden = ref<TableItem[]>([]);
  const status = ref<LoadStatus>('loading');
  const sorted = computed(() => [...items.value].sort(byTableName));
  const archived = computed(() => [...hidden.value].sort(byTableName));

  const load = async (): Promise<void> => {
    status.value = 'loading';
    try {
      const list = await listTables();
      items.value = list.items;
      hidden.value = list.archived;
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

  /** "Ẩn bàn": the table leaves the list for "Bàn đã ẩn". */
  const archive = async (id: string): Promise<TableItem> => {
    const table = await archiveTable(id);
    items.value = items.value.filter((item) => item.id !== id);
    hidden.value = [...hidden.value.filter((item) => item.id !== id), table];
    return table;
  };

  /** "Hiện lại": back in the list, printable again. */
  const unarchive = async (id: string): Promise<TableItem> => {
    const table = await unarchiveTable(id);
    hidden.value = hidden.value.filter((item) => item.id !== id);
    items.value = [...items.value.filter((item) => item.id !== id), table];
    return table;
  };

  return {
    items: sorted,
    archived,
    status,
    load,
    add,
    update,
    rotate,
    remove,
    archive,
    unarchive,
  };
};
