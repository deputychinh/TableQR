<script setup lang="ts">
import { computed, ref, useId } from 'vue';

/**
 * A labelled text input for whole numbers: numeric keypad on phones, an optional unit after the
 * value (e.g. "₫", "phút"). The value stays a string; the caller parses and validates it.
 */
const props = withDefaults(
  defineProps<{ label: string; unit?: string; hint?: string; error?: string }>(),
  { unit: undefined, hint: undefined, error: undefined },
);
const model = defineModel<string>({ required: true });
const id = useId();
const describedBy = computed(
  () =>
    [props.hint ? `${id}-hint` : '', props.error ? `${id}-error` : ''].filter(Boolean).join(' ') ||
    undefined,
);
const input = ref<HTMLInputElement | null>(null);
defineExpose({ focus: () => input.value?.focus() });
</script>

<template>
  <div class="number-field" :class="{ 'number-field--invalid': error }">
    <label class="number-field__label" :for="id">{{ label }}</label>
    <div class="number-field__control">
      <input
        :id="id"
        ref="input"
        v-model="model"
        class="number-field__input"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
      />
      <span v-if="unit" class="number-field__unit" aria-hidden="true">{{ unit }}</span>
    </div>
    <p v-if="hint" :id="`${id}-hint`" class="number-field__hint">{{ hint }}</p>
    <p v-if="error" :id="`${id}-error`" class="number-field__error">{{ error }}</p>
  </div>
</template>

<style scoped>
.number-field {
  display: grid;
  gap: var(--space-1);
}

.number-field__label {
  font-weight: var(--font-weight-medium);
}

.number-field__control {
  position: relative;
}

.number-field__input {
  inline-size: 100%;
  min-block-size: var(--target-min);
  padding-inline: var(--space-3) var(--space-6);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-1);
  font: inherit;
  color: var(--color-text);
  background: var(--color-surface);
}

.number-field--invalid .number-field__input {
  border-color: var(--color-danger);
  border-width: 2px;
}

.number-field__unit {
  position: absolute;
  inset-block: 0;
  inset-inline-end: var(--space-3);
  display: grid;
  place-items: center;
  color: var(--color-text-muted);
  pointer-events: none;
}

.number-field__hint {
  margin: 0;
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
}

.number-field__error {
  margin: 0;
  font-size: var(--font-size-small);
  color: var(--color-danger);
}
</style>
