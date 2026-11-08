<script setup lang="ts">
import { useId } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseButton from '@/components/BaseButton.vue';
import type { FloorTable, ReadyItem } from '../services/serving.service';

/** One table's ready dishes, oldest first (AC35), each with "Đã ra bàn" (AC36). */
defineProps<{ table: FloorTable; busyId: string | undefined }>();
const emit = defineEmits<{ serve: [item: ReadyItem] }>();
const { t } = useI18n();
const id = useId();

const timeOf = (iso: string) =>
  new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
</script>

<template>
  <article class="ready-table-card" :aria-labelledby="`${id}-title`">
    <h3 :id="`${id}-title`" class="ready-table-card__title">
      {{ t('serving.table', { table: table.tableName, party: table.partySize }) }}
    </h3>
    <ul class="ready-table-card__items">
      <li v-for="item in table.ready" :key="item.id" class="ready-table-card__item">
        <div :id="`${id}-${item.id}`" class="ready-table-card__text">
          <p class="ready-table-card__dish">
            <span class="ready-table-card__quantity">
              {{ t('serving.item.quantity', { n: item.quantity }) }}
            </span>
            {{ item.name }}
          </p>
          <p v-if="item.note" class="ready-table-card__note">
            {{ t('serving.item.note', { note: item.note }) }}
          </p>
          <p class="ready-table-card__time">
            {{ t('serving.item.doneAt', { time: timeOf(item.doneAt) }) }}
          </p>
        </div>
        <BaseButton
          size="lg"
          :loading="busyId === item.id"
          :aria-describedby="`${id}-${item.id} ${id}-title`"
          @click="emit('serve', item)"
        >
          {{ t('serving.item.serve') }}
        </BaseButton>
      </li>
    </ul>
  </article>
</template>

<style scoped>
.ready-table-card {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  background: var(--color-surface);
  box-shadow: var(--shadow-1);
}

.ready-table-card__title {
  margin: 0;
  font-size: var(--font-size-lead);
}

.ready-table-card__items {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.ready-table-card__item {
  display: grid;
  gap: var(--space-2);
  padding-block-start: var(--space-2);
  border-block-start: 1px solid var(--color-border);
}

.ready-table-card__text {
  display: grid;
  gap: var(--space-1);
}

.ready-table-card__dish {
  margin: 0;
  font-size: var(--font-size-lead);
  font-weight: var(--font-weight-bold);
}

.ready-table-card__quantity {
  color: var(--color-primary);
}

.ready-table-card__note,
.ready-table-card__time {
  margin: 0;
  color: var(--color-text-muted);
}

@media (width >= 600px) {
  .ready-table-card__item {
    grid-template-columns: 1fr auto;
    align-items: center;
  }
}
</style>
