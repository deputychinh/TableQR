<script setup lang="ts">
/** A status word with an icon; colour is never the only signal (design-system principle 2). */
withDefaults(
  defineProps<{ label: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' }>(),
  { tone: 'neutral' },
);
</script>

<template>
  <span class="status-chip" :class="`status-chip--${tone}`">
    <slot name="icon" />
    {{ label }}
  </span>
</template>

<style scoped>
.status-chip {
  display: inline-flex;
  gap: var(--space-1);
  align-items: center;
  padding: 0.125rem var(--space-2);
  border: 1px solid currentcolor;
  border-radius: 999px;
  font-size: var(--font-size-small);
  font-weight: var(--font-weight-medium);
  line-height: 1.4;
  white-space: nowrap;
}

.status-chip--neutral {
  color: var(--color-text-muted);
  background: var(--color-surface-muted);
}

.status-chip--success {
  color: var(--color-primary);
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
