<script setup lang="ts">
/** No data yet: says why and offers the next action (slot `action`). */
defineProps<{ title: string; body?: string }>();
</script>

<template>
  <div class="empty-state">
    <span v-if="$slots.icon" class="empty-state__icon"><slot name="icon" /></span>
    <p class="empty-state__title">{{ title }}</p>
    <p v-if="body" class="empty-state__body">{{ body }}</p>
    <div v-if="$slots.action" class="empty-state__action"><slot name="action" /></div>
  </div>
</template>

<style scoped>
.empty-state {
  display: grid;
  gap: var(--space-2);
  justify-items: center;
  padding: var(--space-5) var(--space-3);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-3);
  text-align: center;
  background: var(--color-surface);
}

.empty-state__icon {
  display: grid;
  place-items: center;
  inline-size: 3.5rem;
  block-size: 3.5rem;
  border-radius: 50%;
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.empty-state__title {
  margin: 0;
  font-size: var(--font-size-lead);
  font-weight: var(--font-weight-bold);
}

.empty-state__body {
  max-inline-size: 30rem;
  margin: 0;
  color: var(--color-text-muted);
}

.empty-state__action {
  margin-block-start: var(--space-2);
}
</style>
