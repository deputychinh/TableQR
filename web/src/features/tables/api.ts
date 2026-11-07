import { getJson, sendJson } from '@/api/client';

/** A table as the staff API returns it (`/api/tables`). */
export interface TableItem {
  id: string;
  name: string;
  seats: number;
  qrToken: string;
  qrRotatedAt: string | null;
  createdAt: string;
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

export const listTables = async (): Promise<TableItem[]> =>
  (await getJson<{ items: TableItem[] }>('/tables')).items;

export const createTable = (input: TableInput): Promise<TableItem> =>
  sendJson<TableItem>('POST', '/tables', input);

export const updateTable = (id: string, input: Partial<TableInput>): Promise<TableItem> =>
  sendJson<TableItem>('PATCH', `/tables/${encodeURIComponent(id)}`, input);

export const deleteTable = (id: string): Promise<void> =>
  sendJson<void>('DELETE', `/tables/${encodeURIComponent(id)}`);

export const rotateTableQr = (id: string): Promise<TableItem> =>
  sendJson<TableItem>('POST', `/tables/${encodeURIComponent(id)}/rotate-qr`);

export const resolveGuestTable = (qrToken: string): Promise<GuestTable> =>
  getJson<GuestTable>(`/g/t/${encodeURIComponent(qrToken)}`);
