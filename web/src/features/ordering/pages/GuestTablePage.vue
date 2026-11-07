<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { CircleHelp, Clock, Store, TimerOff } from 'lucide-vue-next';
import { ApiError } from '@/api/client';
import BaseButton from '@/components/BaseButton.vue';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import LoadingState from '@/components/LoadingState.vue';
import NumberStepper from '@/components/NumberStepper.vue';
import { resolveGuestTable, type GuestTable } from '@/features/tables/api';
import { guestApi, type GuestSession } from '../api';
import GuestOrdering from '../components/GuestOrdering.vue';

/**
 * What a guest sees after scanning a table's QR code: check in with the party size or join the
 * table's session (S6), then order (S7) and follow each dish (S11). The guest never logs in.
 */
type State =
  | { kind: 'loading' }
  | { kind: 'party-size' }
  | { kind: 'wait' }
  | { kind: 'ordering'; session: GuestSession }
  | { kind: 'expired' }
  | { kind: 'not-found' }
  | { kind: 'suspended' }
  | { kind: 'error' };

const EXTRA_CHAIRS = 4;

const { t } = useI18n();
const route = useRoute();
const state = ref<State>({ kind: 'loading' });
const table = ref<GuestTable | null>(null);
const partySize = ref(2);
const partySizeError = ref<string | undefined>();
const starting = ref(false);

const token = computed(() =>
  typeof route.params.qrToken === 'string' ? route.params.qrToken : '',
);
const maxParty = computed(() => (table.value?.table.seats ?? 1) + EXTRA_CHAIRS);

const fail = (error: unknown): State => {
  if (!(error instanceof ApiError)) return { kind: 'error' };
  if (error.code === 'QR_EXPIRED') return { kind: 'expired' };
  if (error.code === 'RESTAURANT_SUSPENDED') return { kind: 'suspended' };
  if (error.code === 'WAIT_FOR_STAFF') return { kind: 'wait' };
  if (error.code === 'PARTY_SIZE_REQUIRED') return { kind: 'party-size' };
  if (error.status === 404) return { kind: 'not-found' };
  return { kind: 'error' };
};

/** Joins (or opens, with `size`) the table's session, then shows the ordering screen. */
const enter = async (size?: number) => {
  await guestApi.checkIn(token.value, size);
  state.value = { kind: 'ordering', session: await guestApi.session() };
};

const load = async () => {
  state.value = { kind: 'loading' };
  try {
    const data = await resolveGuestTable(token.value);
    table.value = data;
    document.title = `${data.table.name} · ${data.restaurant.name}`;
    partySize.value = Math.min(2, data.table.seats + EXTRA_CHAIRS);
    await enter();
  } catch (error: unknown) {
    state.value = fail(error);
  }
};

const start = async () => {
  starting.value = true;
  partySizeError.value = undefined;
  try {
    await enter(partySize.value);
  } catch (error: unknown) {
    if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') {
      partySizeError.value = t('ordering.checkIn.partySizeError', { max: maxParty.value });
    } else {
      state.value = fail(error);
    }
  } finally {
    starting.value = false;
  }
};

onMounted(load);
</script>

<template>
  <div class="guest-table">
    <header v-if="table" class="guest-table__bar">
      <span class="guest-table__restaurant">{{ table.restaurant.name }}</span>
      <span class="guest-table__chip">{{ table.table.name }}</span>
    </header>
    <main class="guest-table__main">
      <LoadingState v-if="state.kind === 'loading'" :label="t('guestTable.loading')" :rows="2" />

      <form
        v-else-if="state.kind === 'party-size' && table"
        class="guest-table__check-in"
        @submit.prevent="start"
      >
        <h1 class="guest-table__title">
          {{ t('ordering.checkIn.title', { restaurant: table.restaurant.name }) }}
        </h1>
        <p class="guest-table__where">
          {{ t('ordering.checkIn.where', { table: table.table.name }) }}
        </p>
        <NumberStepper
          v-model="partySize"
          :label="t('ordering.checkIn.partySize')"
          :min="1"
          :max="maxParty"
          :step="1"
          :unit="t('ordering.checkIn.people')"
          :hint="t('ordering.checkIn.partySizeHint', { max: maxParty })"
          :error="partySizeError"
          :decrease-label="t('ordering.checkIn.fewer')"
          :increase-label="t('ordering.checkIn.more')"
        />
        <BaseButton type="submit" size="lg" block :loading="starting">
          {{ starting ? t('ordering.checkIn.starting') : t('ordering.checkIn.start') }}
        </BaseButton>
      </form>

      <EmptyState
        v-else-if="state.kind === 'wait'"
        :heading-level="1"
        :title="t('ordering.checkIn.waitTitle')"
        :body="t('ordering.checkIn.waitBody')"
      >
        <template #icon><Clock :size="32" /></template>
        <template #action>
          <BaseButton size="lg" @click="load">{{ t('ordering.checkIn.retry') }}</BaseButton>
        </template>
      </EmptyState>

      <GuestOrdering v-else-if="state.kind === 'ordering'" :initial="state.session" />

      <EmptyState
        v-else-if="state.kind === 'expired'"
        :heading-level="1"
        :title="t('guestTable.expiredTitle')"
        :body="t('guestTable.expiredBody')"
      >
        <template #icon><TimerOff :size="32" /></template>
      </EmptyState>
      <EmptyState
        v-else-if="state.kind === 'not-found'"
        :heading-level="1"
        :title="t('guestTable.notFoundTitle')"
        :body="t('guestTable.notFoundBody')"
      >
        <template #icon><CircleHelp :size="32" /></template>
      </EmptyState>
      <EmptyState
        v-else-if="state.kind === 'suspended'"
        :heading-level="1"
        :title="t('ordering.checkIn.suspendedTitle')"
        :body="t('ordering.checkIn.suspendedBody')"
      >
        <template #icon><Store :size="32" /></template>
      </EmptyState>
      <ErrorState
        v-else
        :message="t('ordering.checkIn.loadError')"
        :retry-label="t('ordering.checkIn.retry')"
        @retry="load"
      />
    </main>
  </div>
</template>

<style scoped>
.guest-table {
  min-block-size: 100dvh;
  background: var(--color-bg);
}

.guest-table__bar {
  position: sticky;
  inset-block-start: 0;
  z-index: var(--z-header);
  display: flex;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
  min-block-size: var(--target-large);
  padding: var(--space-2) var(--space-3);
  border-block-end: 1px solid var(--color-border);
  background: var(--color-surface);
}

.guest-table__restaurant {
  overflow: hidden;
  font-weight: var(--font-weight-bold);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.guest-table__chip {
  flex: none;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-3);
  border: 1px solid var(--color-primary);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
  background: var(--color-primary-soft);
}

.guest-table__main {
  display: grid;
  gap: var(--space-3);
  max-inline-size: var(--measure-form);
  margin-inline: auto;
  padding: var(--space-4) var(--space-3);
}

.guest-table__check-in {
  display: grid;
  gap: var(--space-4);
}

.guest-table__title {
  margin: 0;
  font-size: var(--font-size-title);
}

.guest-table__where {
  margin: 0;
  color: var(--color-text-muted);
}
</style>
