import { isNewer } from '@/composables/useStream';
import type { ReadyBoard } from './services/serving.service';

/**
 * Applies an `item.status` delta to the waiter's board: a ready dish that moved on (served,
 * cancelled) leaves its table at once. Everything else — a newly ready dish, a table becoming
 * "Đủ món" — needs data the delta does not carry, so the caller re-reads the board.
 */
export const applyReadyDelta = (
  board: ReadyBoard,
  delta: { itemId: string; status: string; version: number },
): ReadyBoard => {
  if (delta.status === 'done') return board;
  let changed = false;
  const tables = board.tables.map((table) => {
    const ready = table.ready.filter(
      (item) => !(item.id === delta.itemId && isNewer(item.version, delta.version)),
    );
    if (ready.length === table.ready.length) return table;
    changed = true;
    const served = table.served + (delta.status === 'served' ? 1 : 0);
    return {
      ...table,
      ready,
      served,
      complete: served > 0 && ready.length === 0 && table.remaining === 0,
    };
  });
  return changed ? { tables } : board;
};
