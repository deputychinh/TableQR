<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import StatusChip from '@/components/StatusChip.vue';
import { formatVnd } from '@/features/menu/price';
import type { Order } from '../api';
import { ITEM_STATE, ORDER_STATE, formatTime, guestItemState } from '../status';

/** The guest's orders, oldest first, each dish with its live status (AC38) and why it waits. */
defineProps<{ orders: readonly Order[]; partySize: number }>();
const { t } = useI18n();

const explain = (order: Order, partySize: number): string | undefined => {
  if (order.status === 'held') {
    return order.holdReason === 'every_order'
      ? t('ordering.orders.heldEvery')
      : t('ordering.orders.heldOver', { n: partySize });
  }
  if (order.status === 'awaiting_payment') return t('ordering.orders.awaitingPayment');
  if (order.status === 'rejected') return t('ordering.orders.rejected');
  return undefined;
};
</script>

<template>
  <ol class="order-list">
    <li v-for="order in orders" :key="order.id" class="order-list__order">
      <article :aria-label="t('ordering.orders.at', { time: formatTime(order.requestedAt) })">
        <header class="order-list__header">
          <span class="order-list__time">
            {{ t('ordering.orders.at', { time: formatTime(order.requestedAt) }) }}
          </span>
          <StatusChip
            :label="t(`ordering.orderState.${order.status}`)"
            :tone="ORDER_STATE[order.status].tone"
            :icon="ORDER_STATE[order.status].icon"
          />
        </header>
        <p
          v-if="explain(order, partySize)"
          class="order-list__explain"
          :class="`order-list__explain--${ORDER_STATE[order.status].tone}`"
        >
          {{ explain(order, partySize) }}
        </p>
        <ul class="order-list__items">
          <li v-for="item in order.items" :key="item.id" class="order-list__item">
            <span class="order-list__text">
              <span class="order-list__name">
                {{ item.name }}
                <span class="order-list__quantity">{{
                  t('ordering.orders.quantity', { n: item.quantity })
                }}</span>
              </span>
              <span v-if="item.note" class="order-list__note">{{ item.note }}</span>
            </span>
            <StatusChip
              :label="t(`ordering.itemState.${guestItemState(order.status, item)}`)"
              :tone="ITEM_STATE[guestItemState(order.status, item)].tone"
              :icon="ITEM_STATE[guestItemState(order.status, item)].icon"
            />
          </li>
        </ul>
        <p class="order-list__total">
          {{ t('ordering.orders.total', { total: formatVnd(order.totalVnd) }) }}
        </p>
      </article>
    </li>
  </ol>
</template>

<style scoped>
.order-list {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.order-list__order {
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  background: var(--color-surface);
}

.order-list__header {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  justify-content: space-between;
}

.order-list__time {
  font-weight: var(--font-weight-bold);
}

.order-list__explain {
  margin: var(--space-2) 0 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-2);
  background: var(--color-surface-muted);
}

.order-list__explain--warning {
  background: var(--color-warning-bg);
}

.order-list__explain--danger {
  background: var(--color-danger-bg);
}

.order-list__items {
  margin: var(--space-2) 0 0;
  padding: 0;
  list-style: none;
}

.order-list__item {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
  padding-block: var(--space-2);
}

.order-list__item + .order-list__item {
  border-block-start: 1px solid var(--color-border);
}

.order-list__text {
  display: grid;
  gap: var(--space-1);
  min-inline-size: 0;
}

.order-list__name {
  overflow-wrap: anywhere;
}

.order-list__quantity {
  font-weight: var(--font-weight-bold);
  white-space: nowrap;
}

.order-list__note {
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
}

.order-list__total {
  margin: var(--space-2) 0 0;
  color: var(--color-text-muted);
  text-align: end;
}
</style>
