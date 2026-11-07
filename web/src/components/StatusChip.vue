<script setup lang="ts">
import type { Component } from 'vue';

/** A status shown with icon + word + colour, never colour alone (docs/design-system.md). */
withDefaults(
  defineProps<{
    label: string;
    tone?: 'neutral' | 'success' | 'warning' | 'danger';
    icon?: Component;
  }>(),
  { tone: 'neutral', icon: undefined },
);
</script>

<template>
  <span class="status-chip" :class="`status-chip--${tone}`">
    <component :is="icon" v-if="icon" :size="16" aria-hidden="true" />
    {{ label }}
  </span>
</template>

<style scoped>
.status-chip {
  display: inline-flex;
  gap: var(--space-1);
  align-items: center;
  padding: var(--space-1) var(--space-2);
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: var(--font-size-small);
  font-weight: var(--font-weight-medium);
  line-height: 1.2;
  white-space: nowrap;
}

.status-chip--neutral {
  color: var(--color-text);
  background: var(--color-surface-muted);
  border-color: var(--color-border);
}

.status-chip--success {
  color: var(--color-primary-hover);
  background: var(--color-success-bg);
}

.status-chip--warning {
  color: var(--color-warning);
  background: var(--color-warning-bg);
}

.status-chip--danger {
  color: var(--color-danger);
  background: var(--color-danger-bg);
}
</style>
