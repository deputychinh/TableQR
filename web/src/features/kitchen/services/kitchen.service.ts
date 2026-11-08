import { getJson, sendJson } from '@/api/client';

/** Mirrors the API (services/api/src/kitchen/kitchen.service.ts). */
export type QueueStatus = 'waiting' | 'cooking';

export interface KitchenStation {
  id: string;
  name: string;
  lateAfterMinutes: number;
  waiting: number;
  cooking: number;
}

export interface Ticket {
  id: string;
  version: number;
  status: QueueStatus;
  menuItemId: string;
  name: string;
  quantity: number;
  note: string | null;
  sessionId: string;
  tableName: string;
  partySize: number;
  queueAt: string;
  startedAt: string | null;
  lateAt: string;
}

export interface StationQueue {
  station: { id: string; name: string; lateAfterMinutes: number };
  serverTime: string;
  items: Ticket[];
}

export interface ItemChange {
  id: string;
  status: string;
  version: number;
  skipReason: string | null;
}

export const SKIP_REASON_MAX = 140;

const item = (id: string, action: 'start' | 'done') =>
  `/kitchen/items/${encodeURIComponent(id)}/${action}`;

export const listStations = async (): Promise<KitchenStation[]> =>
  (await getJson<{ stations: KitchenStation[] }>('/kitchen/stations')).stations;

export const getQueue = (stationId: string): Promise<StationQueue> =>
  getJson<StationQueue>(`/kitchen/stations/${encodeURIComponent(stationId)}/queue`);

export const stationStreamUrl = (stationId: string): string =>
  `/api/stream/station/${encodeURIComponent(stationId)}`;

export const startItem = (ticket: Pick<Ticket, 'id' | 'version'>): Promise<ItemChange> =>
  sendJson<ItemChange>('POST', item(ticket.id, 'start'), { version: ticket.version });

export const finishItem = (
  ticket: Pick<Ticket, 'id' | 'version'>,
  skipReason?: string,
): Promise<ItemChange> =>
  sendJson<ItemChange>('POST', item(ticket.id, 'done'), { version: ticket.version, skipReason });
