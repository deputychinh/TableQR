<script setup lang="ts">
import { computed, useId } from 'vue';

/** The native date picker laid out like FormField: label above, hint and error below. */
const props = withDefaults(
  defineProps<{ label: string; min?: string; max?: string; hint?: string; error?: string }>(),
  { min: undefined, max: undefined, hint: undefined, error: undefined },
);
const model = defineModel<string>({ required: true });
const id = useId();
const describedBy = computed(
  () =>
    [props.hint ? `${id}-hint` : '', props.error ? `${id}-error` : ''].filter(Boolean).join(' ') ||
    undefined,
);
</script>

<template>
  <div class="date-field" :class="{ 'date-field--invalid': error }">
    <label class="date-field__label" :for="id">{{ label }}</label>
    <input
      :id="id"
      v-model="model"
      class="date-field__input"
      type="date"
      :min="min"
      :max="max"
      required
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
    />
    <p v-if="hint" :id="`${id}-hint`" class="date-field__hint">{{ hint }}</p>
    <p v-if="error" :id="`${id}-error`" class="date-field__error">{{ error }}</p>
  </div>
</template>

<style scoped>
.date-field {
  display: grid;
  gap: var(--space-1);
}

.date-field__label {
  font-weight: var(--font-weight-medium);
}

.date-field__input {
  inline-size: 100%;
  min-block-size: var(--target-min);
  padding-inline: var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-1);
  font: inherit;
  color: var(--color-text);
  background: var(--color-surface);
  color-scheme: light dark;
}

.date-field--invalid .date-field__input {
  border-color: var(--color-danger);
  border-width: 2px;
}

.date-field__hint {
  margin: 0;
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
}

.date-field__error {
  margin: 0;
  font-size: var(--font-size-small);
  color: var(--color-danger);
}
</style>
