<script setup lang="ts">
import { computed, useId } from 'vue';

/** A labelled multi-line text input with an optional character limit shown as a hint. */
const props = withDefaults(
  defineProps<{
    label: string;
    hint?: string;
    error?: string;
    maxlength?: number;
    rows?: number;
  }>(),
  { hint: undefined, error: undefined, maxlength: undefined, rows: 3 },
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
  <div class="text-area-field" :class="{ 'text-area-field--invalid': error }">
    <label class="text-area-field__label" :for="id">{{ label }}</label>
    <textarea
      :id="id"
      v-model="model"
      class="text-area-field__input"
      :rows="rows"
      :maxlength="maxlength"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
    />
    <p v-if="hint" :id="`${id}-hint`" class="text-area-field__hint">{{ hint }}</p>
    <p v-if="error" :id="`${id}-error`" class="text-area-field__error">{{ error }}</p>
  </div>
</template>

<style scoped>
.text-area-field {
  display: grid;
  gap: var(--space-1);
}

.text-area-field__label {
  font-weight: var(--font-weight-medium);
}

.text-area-field__input {
  inline-size: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-1);
  font: inherit;
  color: var(--color-text);
  background: var(--color-surface);
  resize: vertical;
}

.text-area-field--invalid .text-area-field__input {
  border-color: var(--color-danger);
  border-width: 2px;
}

.text-area-field__hint {
  margin: 0;
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
}

.text-area-field__error {
  margin: 0;
  font-size: var(--font-size-small);
  color: var(--color-danger);
}
</style>
