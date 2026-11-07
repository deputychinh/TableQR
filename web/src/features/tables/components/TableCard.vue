<script setup lang="ts">
import { computed, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import { Pencil, Printer, RefreshCw, Trash2, Users } from 'lucide-vue-next';
import BaseButton from '@/components/BaseButton.vue';
import type { TableItem } from '../api';
import { guestTableUrl } from '../qr';
import QrImage from './QrImage.vue';

const props = defineProps<{ table: TableItem; canManage: boolean; origin: string }>();
const emit = defineEmits<{ print: []; edit: []; rotate: []; remove: [] }>();
const { t } = useI18n();
const titleId = useId();
const url = computed(() => guestTableUrl(props.origin, props.table.qrToken));
const name = computed(() => ({ name: props.table.name }));
</script>

<template>
  <article class="table-card" :aria-labelledby="titleId">
    <a
      class="table-card__qr"
      :href="url"
      target="_blank"
      rel="noopener"
      :aria-label="t('tables.preview', name)"
    >
      <QrImage :text="url" :alt="t('tables.qrAlt', name)" />
    </a>
    <div class="table-card__info">
      <h2 :id="titleId" class="table-card__name">{{ table.name }}</h2>
      <p class="table-card__seats">
        <Users :size="18" aria-hidden="true" />
        {{ t('tables.seats', { n: table.seats }) }}
      </p>
    </div>
    <div class="table-card__actions">
      <BaseButton
        variant="secondary"
        :aria-label="t('tables.actions.printFor', name)"
        @click="emit('print')"
      >
        <Printer :size="18" aria-hidden="true" />
        {{ t('tables.actions.print') }}
      </BaseButton>
      <template v-if="canManage">
        <BaseButton
          variant="secondary"
          :aria-label="t('tables.actions.editFor', name)"
          @click="emit('edit')"
        >
          <Pencil :size="18" aria-hidden="true" />
          {{ t('tables.actions.edit') }}
        </BaseButton>
        <BaseButton
          variant="ghost"
          :aria-label="t('tables.actions.rotateFor', name)"
          @click="emit('rotate')"
        >
          <RefreshCw :size="18" aria-hidden="true" />
          {{ t('tables.actions.rotate') }}
        </BaseButton>
        <BaseButton
          variant="ghost"
          class="table-card__delete"
          :aria-label="t('tables.actions.deleteFor', name)"
          @click="emit('remove')"
        >
          <Trash2 :size="18" aria-hidden="true" />
          {{ t('tables.actions.delete') }}
        </BaseButton>
      </template>
    </div>
  </article>
</template>

<style scoped>
.table-card {
  display: grid;
  grid-template:
    'qr info' auto
    'actions actions' auto / 6rem 1fr;
  gap: var(--space-3);
  block-size: 100%;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  background: var(--color-surface);
  box-shadow: var(--shadow-1);
}

.table-card__qr {
  grid-area: qr;
  overflow: hidden;
  padding: var(--space-1);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-1);
  background: var(--color-white);
}

.table-card__info {
  display: grid;
  grid-area: info;
  align-content: center;
  gap: var(--space-1);
  min-inline-size: 0;
}

.table-card__name {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: var(--font-size-lead);
}

.table-card__seats {
  display: flex;
  gap: var(--space-1);
  align-items: center;
  margin: 0;
  color: var(--color-text-muted);
}

.table-card__actions {
  display: grid;
  grid-area: actions;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-2);
}

.table-card__actions > * {
  padding-inline: var(--space-2);
  white-space: nowrap;
}

.table-card__delete {
  color: var(--color-danger);
}
</style>
