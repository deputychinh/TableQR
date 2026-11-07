<script setup lang="ts" generic="T extends string">
import { useId } from 'vue';

/** One choice among a few, each explained in a sentence: a fieldset of large radio cards. */
defineProps<{
  legend: string;
  options: readonly { value: T; title: string; body?: string }[];
}>();
const model = defineModel<T>({ required: true });
const name = useId();
</script>

<template>
  <fieldset class="radio-card-group">
    <legend class="radio-card-group__legend">{{ legend }}</legend>
    <div class="radio-card-group__options">
      <label
        v-for="option in options"
        :key="option.value"
        class="radio-card-group__card"
        :class="{ 'radio-card-group__card--selected': model === option.value }"
      >
        <input
          v-model="model"
          class="radio-card-group__input"
          type="radio"
          :name="name"
          :value="option.value"
        />
        <span class="radio-card-group__text">
          <span class="radio-card-group__title">{{ option.title }}</span>
          <span v-if="option.body" class="radio-card-group__body">{{ option.body }}</span>
        </span>
      </label>
    </div>
  </fieldset>
</template>

<style scoped>
.radio-card-group {
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.radio-card-group__legend {
  margin-block-end: var(--space-2);
  padding: 0;
  font-weight: var(--font-weight-medium);
}

.radio-card-group__options {
  display: grid;
  gap: var(--space-2);
}

.radio-card-group__card {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
  min-block-size: var(--target-min);
  padding: var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-2);
  background: var(--color-surface);
  cursor: pointer;
}

.radio-card-group__card--selected {
  border-color: var(--color-primary);
  border-width: 2px;
  padding: calc(var(--space-3) - 1px);
  background: var(--color-primary-soft);
}

.radio-card-group__card:has(:focus-visible) {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}

.radio-card-group__input {
  flex: none;
  inline-size: 1.25rem;
  block-size: 1.25rem;
  margin: 0.125rem 0 0;
  accent-color: var(--color-primary);
}

.radio-card-group__input:focus-visible {
  outline: none;
}

.radio-card-group__text {
  display: grid;
  gap: var(--space-1);
}

.radio-card-group__title {
  font-weight: var(--font-weight-medium);
}

.radio-card-group__body {
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
}
</style>
