<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import { Minus, Plus } from 'lucide-vue-next';

/**
 * A number chosen with − / + buttons (big targets) or typed; always lands on `min + k·step` inside
 * the bounds. Vietnamese decimals use a comma ("0,5"); a dot is accepted too.
 */
const props = withDefaults(
  defineProps<{
    label: string;
    min: number;
    max: number;
    step: number;
    unit?: string;
    hint?: string;
    error?: string;
    decreaseLabel: string;
    increaseLabel: string;
  }>(),
  { unit: undefined, hint: undefined, error: undefined },
);
const model = defineModel<number>({ required: true });
const id = useId();

const format = (value: number): string => String(value).replace('.', ',');
const text = ref(format(model.value));
watch(model, (value) => (text.value = format(value)));

const snap = (value: number): number => {
  const clamped = Math.min(props.max, Math.max(props.min, value));
  const steps = Math.round((clamped - props.min) / props.step);
  return Math.min(props.max, props.min + steps * props.step);
};

const set = (value: number) => {
  // The model getter still holds the parent's old value until it re-renders; use our own.
  const next = snap(value);
  model.value = next;
  text.value = format(next);
};

const commitText = () => {
  const parsed = Number(text.value.trim().replace(',', '.'));
  if (text.value.trim() === '' || Number.isNaN(parsed)) text.value = format(model.value);
  else set(parsed);
};

const onKey = (event: KeyboardEvent) => {
  if (event.key === 'ArrowUp') set(model.value + props.step);
  else if (event.key === 'ArrowDown') set(model.value - props.step);
  else if (event.key === 'Home') set(props.min);
  else if (event.key === 'End') set(props.max);
  else return;
  event.preventDefault();
};

const describedBy = computed(
  () =>
    [props.hint ? `${id}-hint` : '', props.error ? `${id}-error` : ''].filter(Boolean).join(' ') ||
    undefined,
);
</script>

<template>
  <div class="number-stepper" :class="{ 'number-stepper--invalid': error }">
    <label class="number-stepper__label" :for="id">{{ label }}</label>
    <div class="number-stepper__control">
      <button
        type="button"
        class="number-stepper__button"
        :aria-label="decreaseLabel"
        :disabled="model <= min"
        @click="set(model - step)"
      >
        <Minus :size="20" aria-hidden="true" />
      </button>
      <input
        :id="id"
        v-model="text"
        class="number-stepper__input"
        role="spinbutton"
        inputmode="decimal"
        autocomplete="off"
        :aria-valuemin="min"
        :aria-valuemax="max"
        :aria-valuenow="model"
        :aria-valuetext="unit ? `${format(model)} ${unit}` : format(model)"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        @keydown="onKey"
        @change="commitText"
        @blur="commitText"
      />
      <button
        type="button"
        class="number-stepper__button"
        :aria-label="increaseLabel"
        :disabled="model >= max"
        @click="set(model + step)"
      >
        <Plus :size="20" aria-hidden="true" />
      </button>
      <span v-if="unit" class="number-stepper__unit" aria-hidden="true">{{ unit }}</span>
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

@media (hover: hover) {
  .number-stepper__button:hover:not(:disabled) {
    background: var(--color-surface-muted);
  }
}

.number-stepper__input {
  inline-size: 4.5rem;
  min-block-size: var(--target-min);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-1);
  font: inherit;
  font-size: var(--font-size-lead);
  font-weight: var(--font-weight-medium);
  font-variant-numeric: tabular-nums;
  color: var(--color-text);
  text-align: center;
  background: var(--color-surface);
}

.number-stepper--invalid .number-stepper__input {
  border-color: var(--color-danger);
  border-width: 2px;
}

.number-stepper__unit {
  color: var(--color-text-muted);
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
