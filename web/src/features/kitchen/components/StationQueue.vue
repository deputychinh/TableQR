<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChefHat } from 'lucide-vue-next';
import { ApiError } from '@/api/client';
import ConfirmSheet from '@/components/ConfirmSheet.vue';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import LoadingState from '@/components/LoadingState.vue';
import { olderSameDish } from '../queue-state';
import {
  cancelItem,
  finishItem,
  startItem,
  type ItemChange,
  type Ticket,
} from '../services/kitchen.service';
import { useStationQueue } from '../useStationQueue';
import StreamBanner from '@/components/StreamBanner.vue';
import { useConnectionVoice } from '../voice/useConnectionVoice';
import { useVoiceAnnouncements } from '../voice/useVoiceAnnouncements';
import SkipReasonSheet from './SkipReasonSheet.vue';
import TicketCard from './TicketCard.vue';

/**
 * One station's live queue in two columns, oldest first (the server's order, AC30). With `voice`
 * on it also asks the page to say new orders and overdue reminders (TQR-027/028).
 */
const props = withDefaults(defineProps<{ stationId: string; voice?: boolean }>(), {
  voice: false,
});
const emit = defineEmits<{
  /** The live number of waiting dishes, for the station tab's count. */
  waiting: [count: number];
  /** A sentence for the page's speech queue. */
  say: [text: string];
}>();
const { t } = useI18n();
const { items, loaded, failed, now, reminder, status, refetch, applyLocal } = useStationQueue(
  props.stationId,
);
useVoiceAnnouncements({
  items,
  loaded,
  now,
  reminder,
  enabled: toRef(props, 'voice'),
  say: (text) => {
    emit('say', text);
  },
});
// TQR-031: the cook hears it when the screen stops receiving orders, and when it is back.
useConnectionVoice({
  status,
  enabled: toRef(props, 'voice'),
  say: (text) => {
    emit('say', text);
  },
  lost: t('kitchen.voice.lost'),
  back: t('kitchen.voice.back'),
});

const waiting = computed(() => items.value.filter((i) => i.status === 'waiting'));
const cooking = computed(() => items.value.filter((i) => i.status === 'cooking'));
watch(
  () => (loaded.value ? waiting.value.length : undefined),
  (count) => {
    if (count !== undefined) emit('waiting', count);
  },
);

const busyId = ref<string | undefined>();
const message = ref('');
const skipping = ref<{ ticket: Ticket; tables: string[]; sameTable: boolean } | undefined>();

type Outcome = 'ok' | 'skip' | 'failed';

/** Runs one cook action; a stale screen (409/404) re-reads the queue and says so. */
const run = async (ticket: Ticket, action: () => Promise<ItemChange>): Promise<Outcome> => {
  busyId.value = ticket.id;
  message.value = '';
  try {
    applyLocal(await action());
    return 'ok';
  } catch (error: unknown) {
    if (error instanceof ApiError && error.code === 'SKIP_REASON_REQUIRED') return 'skip';
    const stale = error instanceof ApiError && (error.status === 409 || error.status === 404);
    message.value = t(stale ? 'kitchen.errors.changed' : 'kitchen.errors.failed');
    if (stale) await refetch();
    return 'failed';
  } finally {
    busyId.value = undefined;
  }
};

const announceDone = (ticket: Ticket) => {
  message.value = t('kitchen.done', { dish: ticket.name, table: ticket.tableName });
};

const start = (ticket: Ticket) => run(ticket, () => startItem(ticket));

const done = async (ticket: Ticket) => {
  const outcome = await run(ticket, () => finishItem(ticket));
  if (outcome === 'ok') announceDone(ticket);
  if (outcome === 'skip') {
    // AC32: an older same-dish order is ahead; ask the cook why this one goes first.
    // Name the other tables; an earlier order of the same table is "món này gọi trước" (r2 review).
    const names = new Set(olderSameDish(items.value, ticket).map((i) => i.tableName));
    const sameTable = names.delete(ticket.tableName);
    skipping.value = { ticket, tables: [...names], sameTable };
  }
};

/** TQR-025: "Bỏ món" asks first; the guest's bill follows on the server. */
const dropping = ref<Ticket | undefined>();

const confirmDrop = async () => {
  const ticket = dropping.value;
  if (!ticket) return;
  const outcome = await run(ticket, () => cancelItem(ticket));
  dropping.value = undefined;
  if (outcome === 'ok') {
    message.value = t('kitchen.drop.done', { dish: ticket.name, table: ticket.tableName });
  }
};

const confirmSkip = async (reason: string) => {
  const current = skipping.value;
  if (!current) return;
  const outcome = await run(current.ticket, () => finishItem(current.ticket, reason));
  skipping.value = undefined;
  if (outcome === 'ok') announceDone(current.ticket);
};
</script>

<template>
  <div class="station-queue">
    <StreamBanner :status="status" />
    <p class="station-queue__message" role="status">{{ message }}</p>
    <LoadingState v-if="!loaded && !failed" :label="t('kitchen.loading')" :rows="3" />
    <ErrorState
      v-else-if="failed"
      :message="t('kitchen.loadFailed')"
      :retry-label="t('kitchen.retry')"
      @retry="refetch"
    />
    <EmptyState
      v-else-if="items.length === 0"
      :title="t('kitchen.empty.title')"
      :body="t('kitchen.empty.body')"
    >
      <template #icon><ChefHat :size="32" /></template>
    </EmptyState>
    <div v-else class="station-queue__columns">
      <section class="station-queue__column" aria-labelledby="queue-waiting">
        <h2 id="queue-waiting" class="station-queue__heading">
          {{ t('kitchen.columns.waiting', { n: waiting.length }) }}
        </h2>
        <p v-if="waiting.length === 0" class="station-queue__none">
          {{ t('kitchen.columns.emptyWaiting') }}
        </p>
        <ol v-else class="station-queue__list">
          <li v-for="ticket in waiting" :key="ticket.id">
            <TicketCard
              :ticket="ticket"
              :now="now"
              :busy="busyId === ticket.id"
              :reminder="reminder"
              @start="start(ticket)"
              @drop="dropping = ticket"
            />
          </li>
        </ol>
      </section>
      <section class="station-queue__column" aria-labelledby="queue-cooking">
        <h2 id="queue-cooking" class="station-queue__heading">
          {{ t('kitchen.columns.cooking', { n: cooking.length }) }}
        </h2>
        <p v-if="cooking.length === 0" class="station-queue__none">
          {{ t('kitchen.columns.emptyCooking') }}
        </p>
        <ol v-else class="station-queue__list">
          <li v-for="ticket in cooking" :key="ticket.id">
            <TicketCard
              :ticket="ticket"
              :now="now"
              :busy="busyId === ticket.id"
              :reminder="reminder"
              @done="done(ticket)"
              @drop="dropping = ticket"
            />
          </li>
        </ol>
      </section>
    </div>
    <SkipReasonSheet
      :open="skipping !== undefined"
      :dish="skipping?.ticket.name ?? ''"
      :tables="skipping?.tables ?? []"
      :same-table="skipping?.sameTable ?? false"
      :busy="busyId !== undefined"
      @confirm="confirmSkip"
      @cancel="skipping = undefined"
    />
    <ConfirmSheet
      :open="dropping !== undefined"
      :title="
        dropping ? t('kitchen.drop.title', { dish: dropping.name, table: dropping.tableName }) : ''
      "
      :confirm-label="t('kitchen.drop.confirm')"
      :cancel-label="t('kitchen.drop.cancel')"
      variant="danger"
      :busy="busyId !== undefined"
      @confirm="confirmDrop"
      @cancel="dropping = undefined"
    >
      <p>{{ t('kitchen.drop.body') }}</p>
    </ConfirmSheet>
  </div>
</template>

<style scoped>
.station-queue {
  display: grid;
  gap: var(--space-3);
}

.station-queue__message {
  min-block-size: 1.5em;
  margin: 0;
  font-size: var(--font-size-kitchen);
  color: var(--color-text-muted);
}

.station-queue__columns {
  display: grid;
  gap: var(--space-4);
}

.station-queue__column {
  display: grid;
  align-content: start;
  gap: var(--space-3);
}

.station-queue__heading {
  margin: 0;
  font-size: var(--font-size-title);
}

.station-queue__none {
  margin: 0;
  padding: var(--space-4) var(--space-3);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-3);
  font-size: var(--font-size-kitchen);
  color: var(--color-text-muted);
}

.station-queue__list {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

@media (width >= 840px) {
  .station-queue__columns {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
