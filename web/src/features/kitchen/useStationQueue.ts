import { onScopeDispose, ref, shallowRef } from 'vue';
import { staffStream } from '@/composables/staff-stream';
import { useStream, type StreamDelta } from '@/composables/useStream';
import { applyItemDelta, mergeServerList, type SeenStatus } from './queue-state';
import { DEFAULT_REMINDER, type ReminderRule } from './voice/scheduler';
import {
  getQueue,
  stationStreamUrl,
  type StationQueue,
  type Ticket,
} from './services/kitchen.service';

const REFETCH_DELAY_MS = 150;
const TICK_MS = 15_000;

/**
 * One station's live queue: the stream's snapshot, `item.status` deltas by id + version, a
 * re-read when an unknown item joins (a released order), and a clock corrected by the server's
 * time so wait times and lateness are right on an iPad whose clock is off.
 */
export const useStationQueue = (stationId: string) => {
  const items = shallowRef<Ticket[]>([]);
  const loaded = ref(false);
  const failed = ref(false);
  const now = ref(Date.now());
  const reminder = shallowRef<ReminderRule>(DEFAULT_REMINDER);
  const seen = new Map<string, SeenStatus>();
  let offsetMs = 0;
  let refetchTimer: ReturnType<typeof setTimeout> | undefined;

  const take = (queue: StationQueue) => {
    offsetMs = Date.parse(queue.serverTime) - Date.now();
    now.value = Date.now() + offsetMs;
    reminder.value = queue.reminder;
    items.value = mergeServerList(queue.items, seen);
    loaded.value = true;
    failed.value = false;
  };

  const refetch = async () => {
    try {
      take(await getQueue(stationId));
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

  const onDelta = (delta: StreamDelta) => {
    if (delta.type !== 'item.status') return;
    const { itemId, status, version } = delta;
    if (typeof itemId !== 'string' || typeof status !== 'string' || typeof version !== 'number') {
      return;
    }
    const result = applyItemDelta(items.value, seen, { itemId, status, version });
    items.value = result.items;
    if (result.refetch) scheduleRefetch();
  };

  /** What this screen's own action changed, applied before the delta echoes back. */
  const applyLocal = (change: { id: string; status: string; version: number }) => {
    onDelta({
      topic: 'local',
      type: 'item.status',
      itemId: change.id,
      status: change.status,
      version: change.version,
    });
  };

  const { status } = useStream<StationQueue>(
    stationStreamUrl(stationId),
    {
      onSnapshot: take,
      onDelta,
    },
    staffStream,
  );

  // The first read also covers a stream that cannot open (it would only say "reconnecting").
  void refetch();
  const ticker = setInterval(() => {
    now.value = Date.now() + offsetMs;
  }, TICK_MS);
  onScopeDispose(() => {
    clearInterval(ticker);
    if (refetchTimer) clearTimeout(refetchTimer);
  });

  return { items, loaded, failed, now, reminder, status, refetch, applyLocal };
};
