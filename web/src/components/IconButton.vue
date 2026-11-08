<script setup lang="ts">
import type { Component } from 'vue';

/**
 * A square button with only an icon. `label` is required: it is the accessible name (and the
 * tooltip), so an icon is never the only signal. Size meets the 44 px target (WCAG 2.5.8).
 */
withDefaults(
  defineProps<{
    icon: Component;
    label: string;
    disabled?: boolean;
    tone?: 'neutral' | 'danger';
    iconSize?: number;
  }>(),
  { disabled: false, tone: 'neutral', iconSize: 20 },
);
defineEmits<{ click: [event: MouseEvent] }>();
</script>

<template>
  <button
    type="button"
    class="icon-button"
    :class="`icon-button--${tone}`"
    :aria-label="label"
    :title="label"
    :disabled="disabled"
    @click="$emit('click', $event)"
  >
    <component :is="icon" :size="iconSize" aria-hidden="true" />
  </button>
</template>

<style scoped>
.icon-button {
  display: grid;
  flex: none;
  place-items: center;
  inline-size: var(--target-min);
  block-size: var(--target-min);
  border: 0;
  border-radius: var(--radius-2);
  color: var(--color-text);
  background: transparent;
  cursor: pointer;
}

.icon-button--danger {
  color: var(--color-danger);
}

.icon-button:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}

.icon-button:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}

.icon-button:active:not(:disabled) {
  background: var(--color-surface-muted);
}

@media (hover: hover) {
  .icon-button:hover:not(:disabled) {
    background: var(--color-surface-muted);
  }
}
</style>
