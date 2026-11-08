<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ClipboardCheck } from 'lucide-vue-next';
import { ApiError } from '@/api/client';
import RoleShell from '@/app/layouts/RoleShell.vue';
import ConfirmSheet from '@/components/ConfirmSheet.vue';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import FormAlert from '@/components/FormAlert.vue';
import LoadingState from '@/components/LoadingState.vue';
import { useStream } from '@/composables/useStream';
import { FLOOR_STREAM_URL, reviewApi, type ReviewOrder } from '../api';
import ReviewCard from '../components/ReviewCard.vue';

/**
 * Waiter review (S8): held orders to confirm or reject (AC26, AC28, AC29) and "có thể thiếu món"
 * flags (AC27). The floor stream reloads the list whenever an order changes anywhere.
 */
const { t } = useI18n();
const orders = ref<ReviewOrder[]>([]);
const status = ref<'loading' | 'error' | 'ready'>('loading');
const busyId = ref<string | null>(null);
const rejecting = ref<ReviewOrder | null>(null);
const message = ref('');
const actionError = ref('');

const load = async (quiet = false) => {
  if (!quiet) status.value = 'loading';
  try {
    orders.value = await reviewApi.list();
    status.value = 'ready';
  } catch {
    if (!quiet) status.value = 'error';
  }
};

useStream(FLOOR_STREAM_URL, {
  onSnapshot: () => void load(true),
  onDelta: (delta) => {
    if (delta.type === 'order.status') void load(true);
  },
});

const act = async (
  order: ReviewOrder,
  call: (id: string) => Promise<unknown>,
  done: string,
): Promise<void> => {
  busyId.value = order.id;
  actionError.value = '';
  try {
    await call(order.id);
    message.value = t(done, { table: order.table.name });
  } catch (error: unknown) {
    actionError.value =
      error instanceof ApiError && (error.code === 'ORDER_NOT_HELD' || error.status === 404)
        ? t('review.gone')
        : t('review.actionError');
  } finally {
    busyId.value = null;
    rejecting.value = null;
    await load(true);
  }
};

const confirm = (order: ReviewOrder) => act(order, reviewApi.confirm, 'review.confirmed');
const seen = (order: ReviewOrder) => act(order, reviewApi.flagSeen, 'review.seenDone');
const reject = async () => {
  if (rejecting.value) await act(rejecting.value, reviewApi.reject, 'review.rejected');
};
const rejectTitle = computed(() =>
  rejecting.value ? t('review.rejectTitle', { table: rejecting.value.table.name }) : '',
);

onMounted(() => load());
</script>

<template>
  <RoleShell :title="t('review.title')">
    <div class="review-page">
      <h1 class="review-page__title">{{ t('review.title') }}</h1>
      <p class="review-page__lead">{{ t('review.lead') }}</p>
      <p class="review-page__status" role="status">{{ message }}</p>
      <FormAlert v-if="actionError" :message="actionError" />
      <LoadingState v-if="status === 'loading'" :label="t('review.loading')" />
      <ErrorState
        v-else-if="status === 'error'"
        :message="t('review.loadError')"
        :retry-label="t('review.retry')"
        @retry="load()"
      />
      <EmptyState
        v-else-if="orders.length === 0"
        :title="t('review.emptyTitle')"
        :body="t('review.emptyBody')"
      >
        <template #icon><ClipboardCheck :size="32" /></template>
      </EmptyState>
      <ul v-else class="review-page__list">
        <li v-for="order in orders" :key="order.id">
          <ReviewCard
            :order="order"
            :busy="busyId === order.id"
            @confirm="confirm(order)"
            @reject="rejecting = order"
            @seen="seen(order)"
          />
        </li>
      </ul>
    </div>
    <ConfirmSheet
      :open="rejecting !== null"
      :title="rejectTitle"
      :confirm-label="t('review.rejectConfirm')"
      :cancel-label="t('review.cancel')"
      variant="danger"
      :busy="busyId !== null"
      @confirm="reject"
      @cancel="rejecting = null"
    >
      <p>{{ t('review.rejectBody') }}</p>
    </ConfirmSheet>
  </RoleShell>
</template>

<style scoped>
.review-page {
  display: grid;
  gap: var(--space-3);
}

.review-page__title {
  margin: 0;
  font-size: var(--font-size-title);
}

.review-page__lead {
  margin: 0;
  color: var(--color-text-muted);
}

.review-page__status {
  margin: 0;
  font-weight: var(--font-weight-medium);
}

.review-page__list {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

@media (width >= 840px) {
  .review-page__list {
    grid-template-columns: repeat(auto-fill, minmax(22rem, 1fr));
  }
}
</style>
