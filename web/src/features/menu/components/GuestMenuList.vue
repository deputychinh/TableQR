<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { CircleSlash } from 'lucide-vue-next';
import StatusChip from '@/components/StatusChip.vue';
import { formatVnd } from '../price';
import type { GuestMenu } from '../types';

/** The menu as a guest sees it (AC5, AC6); slot `action` holds the order buttons (TQR-012). */
defineProps<{ categories: GuestMenu['categories'] }>();
const { t } = useI18n();
</script>

<template>
  <div class="guest-menu-list">
    <section
      v-for="category in categories"
      :key="category.id"
      class="guest-menu-list__category"
      :aria-labelledby="`guest-category-${category.id}`"
    >
      <h2 :id="`guest-category-${category.id}`" class="guest-menu-list__title">
        {{ category.name }}
      </h2>
      <ul class="guest-menu-list__items">
        <li
          v-for="item in category.items"
          :key="item.id"
          class="guest-menu-list__item"
          :class="{ 'guest-menu-list__item--sold-out': !item.orderable }"
        >
          <span class="guest-menu-list__text">
            <span class="guest-menu-list__name">{{ item.name }}</span>
            <span v-if="item.description" class="guest-menu-list__description">{{
              item.description
            }}</span>
            <StatusChip v-if="!item.orderable" :label="t('menu.guest.soldOut')" tone="warning">
              <template #icon><CircleSlash :size="14" aria-hidden="true" /></template>
            </StatusChip>
          </span>
          <span class="guest-menu-list__side">
            <span class="guest-menu-list__price">{{ formatVnd(item.priceVnd) }}</span>
            <slot name="action" :item="item" />
          </span>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.guest-menu-list {
  display: grid;
  gap: var(--space-4);
}

.guest-menu-list__title {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-lead);
}

.guest-menu-list__items {
  margin: 0;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  list-style: none;
  background: var(--color-surface);
}

.guest-menu-list__item {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
  justify-content: space-between;
  padding: var(--space-3);
}

.guest-menu-list__item + .guest-menu-list__item {
  border-block-start: 1px solid var(--color-border);
}

.guest-menu-list__text {
  display: grid;
  gap: var(--space-1);
  justify-items: start;
  min-inline-size: 0;
}

.guest-menu-list__name {
  font-weight: var(--font-weight-bold);
  overflow-wrap: anywhere;
}

.guest-menu-list__description {
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
}

.guest-menu-list__side {
  display: grid;
  flex: none;
  gap: var(--space-2);
  justify-items: end;
}

.guest-menu-list__price {
  font-weight: var(--font-weight-medium);
  white-space: nowrap;
}

.guest-menu-list__item--sold-out .guest-menu-list__name,
.guest-menu-list__item--sold-out .guest-menu-list__price {
  color: var(--color-text-muted);
}
</style>
