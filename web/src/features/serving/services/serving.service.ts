import { getJson, sendJson } from '@/api/client';

/** Mirrors the API's ready board (services/api/src/kitchen/domain/ready-board.ts). */
export interface ReadyItem {
  id: string;
  version: number;
  name: string;
  quantity: number;
  note: string | null;
  doneAt: string;
}

export interface FloorTable {
  sessionId: string;
  tableName: string;
  partySize: number;
  ready: ReadyItem[];
  remaining: number;
  served: number;
  complete: boolean;
}

export interface ReadyBoard {
  tables: FloorTable[];
}

/** The floor stream's snapshot: each feature owns one part (`ready` is this screen's). */
export interface FloorSnapshot {
  at: string;
  ready?: ReadyBoard;
}

export const FLOOR_STREAM_URL = '/api/stream/floor';

export const getReadyBoard = (): Promise<ReadyBoard> => getJson<ReadyBoard>('/serve/ready');

export const serveItem = (
  item: Pick<ReadyItem, 'id' | 'version'>,
): Promise<{ id: string; status: string; version: number }> =>
  sendJson('POST', `/serve/items/${encodeURIComponent(item.id)}/serve`, { version: item.version });
