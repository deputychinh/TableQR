<script setup lang="ts">
/** Skeleton rows while data loads — never a blank screen. The label is read by screen readers. */
withDefaults(defineProps<{ label: string; rows?: number }>(), { rows: 3 });
</script>

<template>
  <div class="loading-state" role="status" aria-live="polite">
    <span class="visually-hidden">{{ label }}</span>
    <span v-for="n in rows" :key="n" class="loading-state__row" aria-hidden="true" />
  </div>
</template>

<style scoped>
.loading-state {
  display: grid;
  gap: var(--space-3);
}

.loading-state__row {
  display: block;
  block-size: 5rem;
  border-radius: var(--radius-2);
  background: var(--color-surface-muted);
  animation: loading-state-pulse 1.2s ease-in-out infinite alternate;
}

@keyframes loading-state-pulse {
  to {
    opacity: 0.5;
  }
}
</style>
