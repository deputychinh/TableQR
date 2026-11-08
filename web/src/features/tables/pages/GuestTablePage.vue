<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { CircleHelp, TimerOff, UtensilsCrossed } from 'lucide-vue-next';
import { ApiError } from '@/api/client';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import LoadingState from '@/components/LoadingState.vue';
import { resolveGuestTable, type GuestTable } from '../api';
import GuestSuspended from '../components/GuestSuspended.vue';

/** What a guest sees after scanning a table's QR code (AC8, AC10, AC11). Ordering: TQR-011/012. */
type State =
  | { kind: 'loading' }
  | { kind: 'ready'; data: GuestTable }
  | { kind: 'expired' }
  | { kind: 'not-found' }
  | { kind: 'suspended' }
  | { kind: 'error' };

const { t } = useI18n();
const route = useRoute();
const state = ref<State>({ kind: 'loading' });

const load = async () => {
  state.value = { kind: 'loading' };
  const token = typeof route.params.qrToken === 'string' ? route.params.qrToken : '';
  try {
    const data = await resolveGuestTable(token);
    state.value = { kind: 'ready', data };
    document.title = `${data.table.name} · ${data.restaurant.name}`;
  } catch (error: unknown) {
    if (error instanceof ApiError && error.code === 'QR_EXPIRED') state.value = { kind: 'expired' };
    else if (error instanceof ApiError && error.code === 'RESTAURANT_SUSPENDED')
      state.value = { kind: 'suspended' };
    else if (error instanceof ApiError && error.status === 404) state.value = { kind: 'not-found' };
    else state.value = { kind: 'error' };
  }
};

onMounted(load);
</script>

<template>
  <div class="guest-table">
    <header v-if="state.kind === 'ready'" class="guest-table__bar">
      <span class="guest-table__restaurant">{{ state.data.restaurant.name }}</span>
      <span class="guest-table__chip">{{ state.data.table.name }}</span>
    </header>
    <main class="guest-table__main">
      <LoadingState v-if="state.kind === 'loading'" :label="t('guestTable.loading')" :rows="2" />
      <template v-else-if="state.kind === 'ready'">
        <h1 class="guest-table__title">
          {{ t('guestTable.welcome', { restaurant: state.data.restaurant.name }) }}
        </h1>
        <p class="guest-table__where">
          {{ t('guestTable.youAreAt') }}
          <strong>{{ state.data.table.name }}</strong>
          · {{ t('guestTable.seats', { n: state.data.table.seats }) }}
        </p>
        <EmptyState :title="t('guestTable.menuSoonTitle')" :body="t('guestTable.menuSoonBody')">
          <template #icon><UtensilsCrossed :size="32" /></template>
        </EmptyState>
      </template>
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
      <GuestSuspended v-else-if="state.kind === 'suspended'" />
      <ErrorState
        v-else
        :message="t('guestTable.loadError')"
        :retry-label="t('guestTable.retry')"
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

.guest-table__title {
  margin: 0;
  font-size: var(--font-size-title);
}

.guest-table__where {
  margin: 0;
  color: var(--color-text-muted);
}
</style>
