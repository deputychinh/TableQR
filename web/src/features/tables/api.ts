import { getJson, sendJson } from '@/api/client';

/** A table as the staff API returns it (`/api/tables`). */
export interface TableItem {
  id: string;
  name: string;
  seats: number;
  qrToken: string;
  qrRotatedAt: string | null;
  /** Set while the table is hidden ("Ẩn bàn", TQR-024). */
  archivedAt: string | null;
  createdAt: string;
}

/** Tables in use, and the hidden ones apart (TQR-024). */
export interface TableList {
  items: TableItem[];
  archived: TableItem[];
}

export interface TableInput {
  name: string;
  seats: number;
}

/** What a scanned QR code resolves to (`/api/g/t/:qrToken`). */
export interface GuestTable {
  restaurant: { name: string; slug: string };
  table: { id: string; name: string; seats: number };
}

export const listTables = async (): Promise<TableList> => {
  const body = await getJson<{ items: TableItem[]; archived?: TableItem[] }>('/tables');
  return { items: body.items, archived: body.archived ?? [] };
};

export const createTable = (input: TableInput): Promise<TableItem> =>
  sendJson<TableItem>('POST', '/tables', input);

export const updateTable = (id: string, input: Partial<TableInput>): Promise<TableItem> =>
  sendJson<TableItem>('PATCH', `/tables/${encodeURIComponent(id)}`, input);

export const deleteTable = (id: string): Promise<void> =>
  sendJson<void>('DELETE', `/tables/${encodeURIComponent(id)}`);

export const rotateTableQr = (id: string): Promise<TableItem> =>
  sendJson<TableItem>('POST', `/tables/${encodeURIComponent(id)}/rotate-qr`);

export const archiveTable = (id: string): Promise<TableItem> =>
  sendJson<TableItem>('POST', `/tables/${encodeURIComponent(id)}/archive`);

export const unarchiveTable = (id: string): Promise<TableItem> =>
  sendJson<TableItem>('POST', `/tables/${encodeURIComponent(id)}/unarchive`);

export const resolveGuestTable = (qrToken: string): Promise<GuestTable> =>
  getJson<GuestTable>(`/g/t/${encodeURIComponent(qrToken)}`);
