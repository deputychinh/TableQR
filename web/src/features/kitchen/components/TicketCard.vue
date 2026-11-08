<script setup lang="ts">
import { computed, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import { AlarmClock, CircleSlash, Clock } from 'lucide-vue-next';
import BaseButton from '@/components/BaseButton.vue';
import { isLate, waitedMinutes } from '../queue-state';
import type { Ticket } from '../services/kitchen.service';

/**
 * One kitchen ticket (AC34): table and party, quantity × dish, note, wait time. A late ticket
 * (AC33) gets a red border and background plus an alarm icon and the word "Trễ" — never colour alone.
 */
const props = defineProps<{ ticket: Ticket; now: number; busy: boolean }>();
const emit = defineEmits<{ start: []; done: []; drop: [] }>();
const { t } = useI18n();
const id = useId();

const late = computed(() => isLate(props.ticket, props.now));
const waited = computed(() => waitedMinutes(props.ticket, props.now));
const waiting = computed(() => props.ticket.status === 'waiting');
</script>

<template>
  <article
    class="ticket-card"
    :class="{ 'ticket-card--late': late, 'ticket-card--cooking': !waiting }"
    :aria-labelledby="`${id}-title`"
    :aria-describedby="`${id}-wait`"
  >
    <header class="ticket-card__header">
      <h3 :id="`${id}-title`" class="ticket-card__table">
        {{ t('kitchen.ticket.table', { table: ticket.tableName, party: ticket.partySize }) }}
      </h3>
      <span v-if="late" class="ticket-card__late">
        <AlarmClock :size="22" aria-hidden="true" />
        {{ t('kitchen.ticket.late') }}
      </span>
    </header>
    <p class="ticket-card__dish">
      <span class="ticket-card__quantity">{{
        t('kitchen.ticket.quantity', { n: ticket.quantity })
      }}</span>
      {{ ticket.name }}
    </p>
    <p v-if="ticket.note" class="ticket-card__note">
      {{ t('kitchen.ticket.note', { note: ticket.note }) }}
    </p>
    <p :id="`${id}-wait`" class="ticket-card__wait">
      <Clock :size="20" aria-hidden="true" />
      {{ waited === 0 ? t('kitchen.ticket.justIn') : t('kitchen.ticket.waited', { n: waited }) }}
    </p>
    <BaseButton
      v-if="waiting"
      variant="secondary"
      size="lg"
      block
      :loading="busy"
      :aria-describedby="`${id}-title`"
      @click="emit('start')"
    >
      {{ t('kitchen.ticket.start') }}
    </BaseButton>
    <BaseButton
      v-else
      size="lg"
      block
      :loading="busy"
      :aria-describedby="`${id}-title`"
      @click="emit('done')"
    >
      {{ t('kitchen.ticket.done') }}
    </BaseButton>
    <BaseButton
      variant="ghost"
      size="lg"
      block
      class="ticket-card__drop"
      :disabled="busy"
      :aria-describedby="`${id}-title`"
      @click="emit('drop')"
    >
      <CircleSlash :size="20" aria-hidden="true" />
      {{ t('kitchen.ticket.drop') }}
    </BaseButton>
  </article>
</template>

<style scoped>
.ticket-card {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-3);
  font-size: var(--font-size-kitchen);
  background: var(--color-surface);
  box-shadow: var(--shadow-1);
}

.ticket-card--cooking {
  border-color: var(--color-primary);
}

.ticket-card--late {
  border-color: var(--color-danger);
  background: var(--color-danger-bg);
}

.ticket-card__header {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  justify-content: space-between;
}

.ticket-card__table {
  margin: 0;
  font-size: var(--font-size-kitchen);
  font-weight: var(--font-weight-bold);
}

.ticket-card__late {
  display: inline-flex;
  gap: var(--space-1);
  align-items: center;
  padding: var(--space-1) var(--space-2);
  border-radius: 999px;
  font-weight: var(--font-weight-bold);
  color: var(--color-on-primary);
  background: var(--color-danger);
}

.ticket-card__dish {
  margin: 0;
  font-size: var(--font-size-title);
  font-weight: var(--font-weight-bold);
  line-height: 1.25;
}

.ticket-card__quantity {
  color: var(--color-primary);
}

.ticket-card__note {
  margin: 0;
  padding: var(--space-1) var(--space-2);
  border-inline-start: 4px solid var(--color-warning);
  border-radius: var(--radius-1);
  color: var(--color-text);
  background: var(--color-warning-bg);
}

.ticket-card__wait {
  display: flex;
  gap: var(--space-1);
  align-items: center;
  margin: 0;
  color: var(--color-text-muted);
}

.ticket-card__drop {
  color: var(--color-danger);
}

.ticket-card--late .ticket-card__wait {
  color: var(--color-danger);
  font-weight: var(--font-weight-bold);
}
</style>
