<script setup lang="ts">
import { computed, useId } from 'vue';
import { Minus, Plus } from 'lucide-vue-next';

/** A whole number with large − / + buttons (easy one-handed), typing still allowed. */
const props = withDefaults(
  defineProps<{
    label: string;
    min: number;
    max: number;
    decrementLabel: string;
    incrementLabel: string;
    hint?: string;
    error?: string;
  }>(),
  { hint: undefined, error: undefined },
);
const model = defineModel<number>({ required: true });
const id = useId();
const describedBy = computed(
  () =>
    [props.hint ? `${id}-hint` : '', props.error ? `${id}-error` : ''].filter(Boolean).join(' ') ||
    undefined,
);

const clamp = (value: number) => Math.min(props.max, Math.max(props.min, value));
const step = (delta: number) => {
  model.value = clamp((Number.isFinite(model.value) ? model.value : props.min) + delta);
};
const onInput = (event: Event) => {
  const value = Number.parseInt((event.target as HTMLInputElement).value, 10);
  model.value = Number.isNaN(value) ? Number.NaN : value;
};
</script>

<template>
  <div class="number-stepper" :class="{ 'number-stepper--invalid': error }">
    <label class="number-stepper__label" :for="id">{{ label }}</label>
    <div class="number-stepper__control">
      <button
        type="button"
        class="number-stepper__button"
        :aria-label="decrementLabel"
        :aria-controls="id"
        :disabled="model <= min"
        @click="step(-1)"
      >
        <Minus :size="20" aria-hidden="true" />
      </button>
      <input
        :id="id"
        class="number-stepper__input"
        type="number"
        inputmode="numeric"
        :min="min"
        :max="max"
        step="1"
        :value="Number.isNaN(model) ? '' : model"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        @input="onInput"
      />
      <button
        type="button"
        class="number-stepper__button"
        :aria-label="incrementLabel"
        :aria-controls="id"
        :disabled="model >= max"
        @click="step(1)"
      >
        <Plus :size="20" aria-hidden="true" />
      </button>
    </div>
    <p v-if="hint" :id="`${id}-hint`" class="number-stepper__hint">{{ hint }}</p>
    <p v-if="error" :id="`${id}-error`" class="number-stepper__error">{{ error }}</p>
  </div>
</template>

<style scoped>
.number-stepper {
  display: grid;
  gap: var(--space-1);
}

.number-stepper__label {
  font-weight: var(--font-weight-medium);
}

.number-stepper__control {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.number-stepper__button {
  display: grid;
  flex: none;
  place-items: center;
  inline-size: var(--target-min);
  block-size: var(--target-min);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-1);
  color: var(--color-text);
  background: var(--color-surface);
  cursor: pointer;
}

.number-stepper__button:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.number-stepper__input {
  inline-size: 5rem;
  min-block-size: var(--target-min);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-1);
  font: inherit;
  font-size: var(--font-size-lead);
  text-align: center;
  color: var(--color-text);
  background: var(--color-surface);
}

.number-stepper--invalid .number-stepper__input {
  border-color: var(--color-danger);
  border-width: 2px;
}

.number-stepper__hint {
  margin: 0;
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
}

.number-stepper__error {
  margin: 0;
  font-size: var(--font-size-small);
  color: var(--color-danger);
}
</style>
