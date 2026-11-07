<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { CircleAlert, Hourglass } from 'lucide-vue-next';
import BaseButton from '@/components/BaseButton.vue';
import StatusChip from '@/components/StatusChip.vue';
import type { ReviewOrder } from '../api';
import { formatTime } from '../status';

/** One order a waiter must decide on (held, AC26/AC29) or should know about (flag, AC27). */
const props = defineProps<{ order: ReviewOrder; busy: boolean }>();
const emit = defineEmits<{ confirm: []; reject: []; seen: [] }>();
const { t } = useI18n();

const held = computed(() => props.order.status === 'held');
const reason = computed(() =>
  props.order.holdReason === 'every_order'
    ? t('review.heldEvery')
    : t('review.heldOver', { n: props.order.session.partySize }),
);
</script>

<template>
  <article class="review-card" :class="{ 'review-card--held': held }">
    <header class="review-card__header">
      <h2 class="review-card__table">{{ order.table.name }}</h2>
      <span class="review-card__meta">
        {{ t('review.party', { n: order.session.partySize }) }} ·
        {{ t('review.at', { time: formatTime(order.requestedAt) }) }}
      </span>
    </header>
    <div class="review-card__reason">
      <StatusChip
        v-if="held"
        :label="t('ordering.orderState.held')"
        tone="warning"
        :icon="Hourglass"
      />
      <StatusChip v-else :label="t('review.flagShort')" tone="neutral" :icon="CircleAlert" />
      <p class="review-card__why">
        {{
          held
            ? reason
            : t('review.flagShortBody', {
                n: order.session.partySize,
                mains: order.mainPortions,
              })
        }}
      </p>
    </div>
    <ul class="review-card__items">
      <li v-for="item in order.items" :key="item.id" class="review-card__item">
        <span class="review-card__quantity">{{ item.quantity }} ×</span>
        <span class="review-card__name">
          {{ item.name }}
          <span v-if="item.note" class="review-card__note">{{ item.note }}</span>
        </span>
      </li>
    </ul>
    <p class="review-card__mains">{{ t('review.mains', { n: order.mainPortions }) }}</p>
    <div class="review-card__actions">
      <template v-if="held">
        <BaseButton
          variant="danger"
          size="lg"
          :disabled="busy"
          :aria-label="t('review.rejectFor', { table: order.table.name })"
          @click="emit('reject')"
        >
          {{ t('review.reject') }}
        </BaseButton>
        <BaseButton
          size="lg"
          :loading="busy"
          :aria-label="t('review.confirmFor', { table: order.table.name })"
          @click="emit('confirm')"
        >
          {{ t('review.confirm') }}
        </BaseButton>
      </template>
      <BaseButton
        v-else
        variant="secondary"
        size="lg"
        :loading="busy"
        :aria-label="t('review.seenFor', { table: order.table.name })"
        @click="emit('seen')"
      >
        {{ t('review.seen') }}
      </BaseButton>
    </div>
  </article>
</template>

<style scoped>
.review-card {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  background: var(--color-surface);
}

.review-card--held {
  border-color: var(--color-warning);
  border-width: 2px;
}

.review-card__header {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: baseline;
  justify-content: space-between;
}

.review-card__table {
  margin: 0;
  font-size: var(--font-size-title);
}

.review-card__meta {
  color: var(--color-text-muted);
}

.review-card__reason {
  display: grid;
  gap: var(--space-2);
  justify-items: start;
}

.review-card__why {
  margin: 0;
}

.review-card__items {
  display: grid;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.review-card__item {
  display: flex;
  gap: var(--space-2);
  font-size: var(--font-size-lead);
}

.review-card__quantity {
  flex: none;
  min-inline-size: 2.5rem;
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
}

.review-card__name {
  display: grid;
  overflow-wrap: anywhere;
}

.review-card__note {
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
}

.review-card__mains {
  margin: 0;
  color: var(--color-text-muted);
}

.review-card__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
}

.review-card__actions > :only-child {
  grid-column: 1 / -1;
}
</style>
