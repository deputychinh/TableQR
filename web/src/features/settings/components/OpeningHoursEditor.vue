<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { type DayHours, type FieldErrors, WEEKDAYS, type Weekday } from '@/features/settings/model';

/** Opening and closing time per weekday, or closed that day. */
defineProps<{ errors: FieldErrors }>();
const model = defineModel<Record<Weekday, DayHours>>({ required: true });
const { t } = useI18n();

const update = (day: Weekday, patch: Partial<DayHours>) => {
  model.value = { ...model.value, [day]: { ...model.value[day], ...patch } };
};

const valueOf = (event: Event): string => (event.target as HTMLInputElement).value;
const checkedOf = (event: Event): boolean => (event.target as HTMLInputElement).checked;
</script>

<template>
  <ul class="opening-hours">
    <li
      v-for="day in WEEKDAYS"
      :key="day"
      class="opening-hours__day"
      :class="{ 'opening-hours__day--closed': model[day].closed }"
    >
      <span class="opening-hours__name">{{ t(`settings.booking.days.${day}`) }}</span>
      <label class="opening-hours__closed">
        <input
          type="checkbox"
          class="opening-hours__checkbox"
          :checked="model[day].closed"
          :aria-label="
            t('settings.booking.closedLabel', { day: t(`settings.booking.days.${day}`) })
          "
          @change="update(day, { closed: checkedOf($event) })"
        />
        <span aria-hidden="true">{{ t('settings.booking.closedDay') }}</span>
      </label>
      <span class="opening-hours__times">
        <input
          type="time"
          class="opening-hours__time"
          :value="model[day].open"
          :disabled="model[day].closed"
          :aria-label="t('settings.booking.openLabel', { day: t(`settings.booking.days.${day}`) })"
          @change="update(day, { open: valueOf($event) })"
        />
        <span aria-hidden="true">–</span>
        <input
          type="time"
          class="opening-hours__time"
          :value="model[day].close"
          :disabled="model[day].closed"
          :aria-label="t('settings.booking.closeLabel', { day: t(`settings.booking.days.${day}`) })"
          :aria-invalid="errors[`rules.booking.openingHours.${day}.close`] ? 'true' : undefined"
          :aria-describedby="
            errors[`rules.booking.openingHours.${day}.close`] ? `hours-error-${day}` : undefined
          "
          @change="update(day, { close: valueOf($event) })"
        />
      </span>
      <p
        v-if="errors[`rules.booking.openingHours.${day}.close`]"
        :id="`hours-error-${day}`"
        class="opening-hours__error"
      >
        {{ t(errors[`rules.booking.openingHours.${day}.close`] ?? '') }}
      </p>
    </li>
  </ul>
</template>

<style scoped>
.opening-hours {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

.opening-hours__day {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--space-2) var(--space-3);
  align-items: center;
  padding-block: var(--space-2);
  border-block-end: 1px solid var(--color-border);
}

.opening-hours__day:last-child {
  border-block-end: 0;
}

.opening-hours__name {
  font-weight: var(--font-weight-medium);
}

.opening-hours__closed {
  display: inline-flex;
  gap: var(--space-2);
  align-items: center;
  min-block-size: var(--target-min);
  cursor: pointer;
}

.opening-hours__checkbox {
  inline-size: 1.25rem;
  block-size: 1.25rem;
  margin: 0;
  accent-color: var(--color-primary);
}

.opening-hours__times {
  display: flex;
  grid-column: 1 / -1;
  gap: var(--space-2);
  align-items: center;
}

.opening-hours__time {
  flex: 1;
  min-inline-size: 0;
  min-block-size: var(--target-min);
  padding-inline: var(--space-2);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-1);
  font: inherit;
  color: var(--color-text);
  background: var(--color-surface);
}

.opening-hours__time:disabled {
  opacity: 0.45;
}

.opening-hours__day--closed .opening-hours__name {
  color: var(--color-text-muted);
}

.opening-hours__error {
  grid-column: 1 / -1;
  margin: 0;
  font-size: var(--font-size-small);
  color: var(--color-danger);
}

@media (width >= 600px) {
  .opening-hours__day {
    grid-template-columns: 7rem 1fr auto;
  }

  .opening-hours__times {
    grid-row: 1;
    grid-column: 2;
  }

  .opening-hours__time {
    flex: 0 1 8rem;
  }
}
</style>
