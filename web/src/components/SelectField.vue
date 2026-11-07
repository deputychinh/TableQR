<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import { ChevronDown } from 'lucide-vue-next';

/** A native select laid out like FormField: label above, hint and error below. */
const props = withDefaults(
  defineProps<{
    label: string;
    options: readonly { value: string; label: string }[];
    hint?: string;
    error?: string;
  }>(),
  { hint: undefined, error: undefined },
);
const model = defineModel<string>({ required: true });
const id = useId();
const describedBy = computed(
  () =>
    [props.hint ? `${id}-hint` : '', props.error ? `${id}-error` : ''].filter(Boolean).join(' ') ||
    undefined,
);
const select = ref<HTMLSelectElement | null>(null);
defineExpose({ focus: () => select.value?.focus() });
</script>

<template>
  <div class="select-field" :class="{ 'select-field--invalid': error }">
    <label class="select-field__label" :for="id">{{ label }}</label>
    <div class="select-field__control">
      <select
        :id="id"
        ref="select"
        v-model="model"
        class="select-field__select"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
      >
        <option v-for="option in options" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
      <ChevronDown :size="20" aria-hidden="true" class="select-field__chevron" />
    </div>
    <p v-if="hint" :id="`${id}-hint`" class="select-field__hint">{{ hint }}</p>
    <p v-if="error" :id="`${id}-error`" class="select-field__error">{{ error }}</p>
  </div>
</template>

<style scoped>
.select-field {
  display: grid;
  gap: var(--space-1);
}

.select-field__label {
  font-weight: var(--font-weight-medium);
}

.select-field__control {
  position: relative;
}

.select-field__select {
  inline-size: 100%;
  min-block-size: var(--target-min);
  padding-inline: var(--space-3) calc(var(--space-3) + 1.5rem);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-1);
  font: inherit;
  color: var(--color-text);
  background: var(--color-surface);
  appearance: none;
}

.select-field--invalid .select-field__select {
  border-color: var(--color-danger);
  border-width: 2px;
}

.select-field__chevron {
  position: absolute;
  inset-block-start: 50%;
  inset-inline-end: var(--space-3);
  color: var(--color-text-muted);
  transform: translateY(-50%);
  pointer-events: none;
}

.select-field__hint {
  margin: 0;
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
}

.select-field__error {
  margin: 0;
  font-size: var(--font-size-small);
  color: var(--color-danger);
}
</style>
