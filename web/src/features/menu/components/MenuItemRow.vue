<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { CircleSlash, Pencil } from 'lucide-vue-next';
import IconButton from '@/components/IconButton.vue';
import StatusChip from '@/components/StatusChip.vue';
import ToggleSwitch from '@/components/ToggleSwitch.vue';
import { formatVnd } from '../price';
import type { MenuItem } from '../types';

defineProps<{ item: MenuItem; stationName: string; canEdit: boolean; canToggle: boolean }>();
const emit = defineEmits<{ toggle: [available: boolean]; edit: [] }>();
const { t } = useI18n();
</script>

<template>
  <li class="menu-item-row" :class="{ 'menu-item-row--sold-out': !item.available }">
    <div class="menu-item-row__body">
      <span class="menu-item-row__name">{{ item.name }}</span>
      <span class="menu-item-row__meta">
        <span class="menu-item-row__price">{{ formatVnd(item.priceVnd) }}</span>
        <span aria-hidden="true">·</span>
        <span>{{ stationName }}</span>
      </span>
      <span v-if="item.description" class="menu-item-row__description">{{ item.description }}</span>
      <StatusChip v-if="!item.available" :label="t('menu.item.soldOut')" tone="warning">
        <template #icon><CircleSlash :size="14" aria-hidden="true" /></template>
      </StatusChip>
    </div>
    <div class="menu-item-row__actions">
      <ToggleSwitch
        v-if="canToggle"
        :model-value="item.available"
        :label="t('menu.item.availableLabel', { name: item.name })"
        :state-text="item.available ? t('menu.item.available') : t('menu.item.soldOut')"
        @update:model-value="emit('toggle', $event)"
      />
      <IconButton
        v-if="canEdit"
        :icon="Pencil"
        :label="t('menu.item.edit', { name: item.name })"
        @click="emit('edit')"
      />
    </div>
  </li>
</template>

<style scoped>
.menu-item-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-3);
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3);
  border-block-start: 1px solid var(--color-border);
}

.menu-item-row__body {
  display: grid;
  flex: 1 1 12rem;
  gap: var(--space-1);
  justify-items: start;
  min-inline-size: 0;
}

.menu-item-row__name {
  font-weight: var(--font-weight-bold);
  overflow-wrap: anywhere;
}

.menu-item-row__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  color: var(--color-text-muted);
}

.menu-item-row__price {
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
}

.menu-item-row__description {
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
  overflow-wrap: anywhere;
}

.menu-item-row--sold-out .menu-item-row__name {
  color: var(--color-text-muted);
  text-decoration: line-through;
}

.menu-item-row__actions {
  display: flex;
  flex: none;
  gap: var(--space-1);
  align-items: center;
  margin-inline-start: auto;
}
</style>
