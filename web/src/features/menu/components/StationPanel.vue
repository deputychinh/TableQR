<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ChefHat, Pencil, Plus, Trash2 } from 'lucide-vue-next';
import BaseButton from '@/components/BaseButton.vue';
import type { Station } from '../types';

defineProps<{ stations: Station[]; canEdit: boolean }>();
const emit = defineEmits<{ add: []; edit: [station: Station]; remove: [station: Station] }>();
const { t } = useI18n();
</script>

<template>
  <section class="station-panel" aria-labelledby="station-panel-title">
    <h2 id="station-panel-title" class="station-panel__title">
      <ChefHat :size="20" aria-hidden="true" />
      {{ t('menu.station.title') }}
    </h2>
    <p class="station-panel__lead">{{ t('menu.station.lead') }}</p>
    <ul class="station-panel__list">
      <li v-for="station in stations" :key="station.id" class="station-panel__row">
        <span class="station-panel__text">
          <span class="station-panel__name">{{ station.name }}</span>
          <span class="station-panel__late">{{
            t('menu.station.lateText', { n: station.lateAfterMinutes })
          }}</span>
        </span>
        <template v-if="canEdit">
          <button
            type="button"
            class="station-panel__icon"
            :aria-label="t('menu.station.edit', { name: station.name })"
            @click="emit('edit', station)"
          >
            <Pencil :size="18" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="station-panel__icon"
            :aria-label="t('menu.station.remove', { name: station.name })"
            @click="emit('remove', station)"
          >
            <Trash2 :size="18" aria-hidden="true" />
          </button>
        </template>
      </li>
    </ul>
    <BaseButton v-if="canEdit" variant="secondary" block @click="emit('add')">
      <Plus :size="18" aria-hidden="true" />
      {{ t('menu.station.add') }}
    </BaseButton>
  </section>
</template>

<style scoped>
.station-panel {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  background: var(--color-surface);
}

.station-panel__title {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  margin: 0;
  font-size: var(--font-size-lead);
}

.station-panel__lead {
  margin: 0;
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
}

.station-panel__list {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

.station-panel__row {
  display: flex;
  gap: var(--space-1);
  align-items: center;
  padding-block: var(--space-2);
  border-block-end: 1px solid var(--color-border);
}

.station-panel__text {
  display: grid;
  flex: 1;
  min-inline-size: 0;
}

.station-panel__name {
  font-weight: var(--font-weight-medium);
  overflow-wrap: anywhere;
}

.station-panel__late {
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
}

.station-panel__icon {
  display: grid;
  flex: none;
  place-items: center;
  inline-size: var(--target-min);
  block-size: var(--target-min);
  border: 0;
  border-radius: var(--radius-2);
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

@media (hover: hover) {
  .station-panel__icon:hover {
    color: var(--color-text);
    background: var(--color-surface-muted);
  }
}
</style>
