<script setup lang="ts">
/** A large on/off switch (role="switch"); the label always says what "on" means. */
withDefaults(
  defineProps<{
    label: string;
    /** Visible text next to the switch; the accessible name stays `label`. */
    stateText?: string;
    disabled?: boolean;
  }>(),
  { stateText: undefined, disabled: false },
);
const model = defineModel<boolean>({ required: true });
</script>

<template>
  <button
    type="button"
    role="switch"
    class="toggle-switch"
    :class="{ 'toggle-switch--on': model }"
    :aria-checked="model"
    :aria-label="label"
    :disabled="disabled"
    @click="model = !model"
  >
    <span class="toggle-switch__track" aria-hidden="true">
      <span class="toggle-switch__thumb" />
    </span>
    <span v-if="stateText" class="toggle-switch__text" aria-hidden="true">{{ stateText }}</span>
  </button>
</template>

<style scoped>
.toggle-switch {
  display: inline-flex;
  gap: var(--space-2);
  align-items: center;
  min-block-size: var(--target-min);
  padding: 0 var(--space-1);
  border: 0;
  border-radius: var(--radius-2);
  font: inherit;
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.toggle-switch__track {
  position: relative;
  flex: none;
  inline-size: 3.25rem;
  block-size: 2rem;
  border: 2px solid var(--color-border-strong);
  border-radius: 1rem;
  background: var(--color-surface-muted);
  transition: background-color var(--duration-fast) ease-out;
}

.toggle-switch__thumb {
  position: absolute;
  inset-block-start: 0.125rem;
  inset-inline-start: 0.125rem;
  inline-size: 1.5rem;
  block-size: 1.5rem;
  border-radius: 50%;
  background: var(--color-border-strong);
  transition: transform var(--duration-fast) ease-out;
}

.toggle-switch--on {
  color: var(--color-primary);
}

.toggle-switch--on .toggle-switch__track {
  border-color: var(--color-primary);
  background: var(--color-primary);
}

.toggle-switch--on .toggle-switch__thumb {
  background: var(--color-on-primary);
  transform: translateX(1.25rem);
}

.toggle-switch__text {
  min-inline-size: 4.5rem;
  font-weight: var(--font-weight-medium);
  text-align: start;
}

.toggle-switch:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
