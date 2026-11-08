<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { HeartHandshake, QrCode } from 'lucide-vue-next';
import { ApiError } from '@/api/client';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import LoadingState from '@/components/LoadingState.vue';
import { useStream } from '@/composables/useStream';
import GuestBill from '../components/GuestBill.vue';
import { GUEST_BILL_STREAM, getGuestBill, requestGuestBill, type SessionBill } from '../api';
import { billChanged } from '../bill-state';

/** `/t/:qrToken/hoa-don`: the guest asks for the bill and watches it turn "Đã thanh toán". */
type State =
  | { kind: 'loading' }
  | { kind: 'ready'; bill: SessionBill }
  | { kind: 'no-session' }
  | { kind: 'closed' }
  | { kind: 'error' };

const { t } = useI18n();
const route = useRoute();
const state = ref<State>({ kind: 'loading' });
const changed = ref(false);
const tableUrl = computed(
  () =>
    `/t/${encodeURIComponent(typeof route.params.qrToken === 'string' ? route.params.qrToken : '')}`,
);

const apply = (next: SessionBill) => {
  const previous = state.value.kind === 'ready' ? state.value.bill : undefined;
  if (billChanged(previous, next)) changed.value = true;
  if (next.bill?.status === 'paid') changed.value = false;
  state.value = { kind: 'ready', bill: next };
  document.title = `${t('billing.guest.title')} · ${next.session.tableName}`;
};

const fail = (error: unknown) => {
  if (error instanceof ApiError && error.status === 401) {
    // A phone that was in the bill and loses its session: the cashier closed the table.
    state.value = { kind: state.value.kind === 'ready' ? 'closed' : 'no-session' };
  } else if (state.value.kind !== 'ready') {
    state.value = { kind: 'error' };
  }
};

const load = async () => {
  state.value = { kind: 'loading' };
  try {
    apply(await requestGuestBill());
  } catch (error: unknown) {
    fail(error);
  }
};

const refresh = async () => {
  try {
    apply(await getGuestBill());
  } catch (error: unknown) {
    fail(error);
  }
};

useStream<SessionBill>(GUEST_BILL_STREAM, {
  onSnapshot: (snapshot) => {
    if (state.value.kind === 'ready') apply(snapshot);
  },
  onDelta: () => void refresh(),
});

onMounted(load);
</script>

<template>
  <div class="guest-bill-page">
    <header v-if="state.kind === 'ready'" class="guest-bill-page__bar">
      <span class="guest-bill-page__restaurant">{{ state.bill.restaurantName }}</span>
      <span class="guest-bill-page__chip">{{ state.bill.session.tableName }}</span>
    </header>
    <main class="guest-bill-page__main">
      <LoadingState v-if="state.kind === 'loading'" :label="t('billing.guest.loading')" :rows="3" />
      <template v-else-if="state.kind === 'ready'">
        <GuestBill :bill="state.bill" :changed="changed" :table-url="tableUrl" @request="load" />
      </template>
      <EmptyState
        v-else-if="state.kind === 'no-session'"
        :heading-level="1"
        :title="t('billing.guest.noSessionTitle')"
        :body="t('billing.guest.noSessionBody')"
      >
        <template #icon><QrCode :size="32" /></template>
        <template #action>
          <RouterLink class="guest-bill-page__link" :to="tableUrl">
            {{ t('billing.guest.backToTable') }}
          </RouterLink>
        </template>
      </EmptyState>
      <EmptyState
        v-else-if="state.kind === 'closed'"
        :heading-level="1"
        :title="t('billing.guest.closedTitle')"
        :body="t('billing.guest.closedBody')"
      >
        <template #icon><HeartHandshake :size="32" /></template>
      </EmptyState>
      <ErrorState
        v-else
        :message="t('billing.guest.loadError')"
        :retry-label="t('billing.guest.retry')"
        @retry="load"
      />
    </main>
  </div>
</template>

<style scoped>
.guest-bill-page {
  min-block-size: 100dvh;
  background: var(--color-bg);
}

.guest-bill-page__bar {
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

.guest-bill-page__restaurant {
  overflow: hidden;
  font-weight: var(--font-weight-bold);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.guest-bill-page__chip {
  flex: none;
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-3);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
  background: var(--color-primary-soft);
}

.guest-bill-page__main {
  display: grid;
  gap: var(--space-4);
  max-inline-size: var(--measure-form);
  margin-inline: auto;
  padding: var(--space-4) var(--space-3) var(--space-6);
}

.guest-bill-page__link {
  display: inline-flex;
  align-items: center;
  min-block-size: var(--target-min);
  font-weight: var(--font-weight-medium);
  color: var(--color-primary);
}
</style>
