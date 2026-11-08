import { onScopeDispose, ref, shallowRef } from 'vue';
import { staffStream } from '@/composables/staff-stream';
import { useStream, type StreamDelta } from '@/composables/useStream';
import { applyReadyDelta } from './board-state';
import {
  FLOOR_STREAM_URL,
  getReadyBoard,
  type FloorSnapshot,
  type ReadyBoard,
} from './services/serving.service';

const REFETCH_DELAY_MS = 150;
const BOARD_STATUSES: ReadonlySet<string> = new Set(['done', 'served', 'cancelled']);

/**
 * The waiter's live board: the floor stream's `ready` snapshot, `item.status` deltas applied by
 * id + version, and a short-debounced re-read for changes a delta cannot describe (a dish just
 * became ready, a table is now "Đủ món").
 */
export const useReadyBoard = () => {
  const board = shallowRef<ReadyBoard>({ tables: [] });
  const loaded = ref(false);
  const failed = ref(false);
  let refetchTimer: ReturnType<typeof setTimeout> | undefined;

  const take = (next: ReadyBoard) => {
    board.value = next;
    loaded.value = true;
    failed.value = false;
  };

  /** Only the newest read may land: a slow older answer must not bring back a served dish. */
  let reads = 0;
  const refetch = async () => {
    reads += 1;
    const read = reads;
    try {
      const next = await getReadyBoard();
      if (read === reads) take(next);
    } catch {
      failed.value = !loaded.value;
    }
  };

  const scheduleRefetch = () => {
    if (refetchTimer) clearTimeout(refetchTimer);
    refetchTimer = setTimeout(() => {
      refetchTimer = undefined;
      void refetch();
    }, REFETCH_DELAY_MS);
  };

  const applyChange = (change: { itemId: string; status: string; version: number }) => {
    board.value = applyReadyDelta(board.value, change);
    // waiting → cooking does not change the board; only these do (ready, served, cancelled).
    if (BOARD_STATUSES.has(change.status)) scheduleRefetch();
  };

  const onDelta = (delta: StreamDelta) => {
    if (delta.type !== 'item.status') return;
    const { itemId, status, version } = delta;
    if (typeof itemId !== 'string' || typeof status !== 'string' || typeof version !== 'number') {
      return;
    }
    applyChange({ itemId, status, version });
  };

  const { status } = useStream<FloorSnapshot>(
    FLOOR_STREAM_URL,
    {
      onSnapshot: (snapshot) => {
        reads += 1; // the snapshot is the truth; any read still in flight is older
        if (snapshot.ready) take(snapshot.ready);
      },
      onDelta,
    },
    staffStream,
  );

  void refetch();
  onScopeDispose(() => {
    if (refetchTimer) clearTimeout(refetchTimer);
  });

  return { board, loaded, failed, status, refetch, applyChange };
};
