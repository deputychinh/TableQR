<script setup lang="ts">
/** "Nothing here yet": says why and offers the next action (slot `action`); icon in slot `icon`. */
withDefaults(defineProps<{ title: string; body?: string; headingLevel?: 1 | 2 }>(), {
  body: undefined,
  headingLevel: 2,
});
</script>

<template>
  <section class="empty-state">
    <span v-if="$slots.icon" class="empty-state__icon" aria-hidden="true">
      <slot name="icon" />
    </span>
    <component :is="`h${headingLevel}`" class="empty-state__title">{{ title }}</component>
    <p v-if="body" class="empty-state__body">{{ body }}</p>
    <div v-if="$slots.action" class="empty-state__action">
      <slot name="action" />
    </div>
  </section>
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
  inline-size: 4rem;
  block-size: 4rem;
  border-radius: 50%;
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.empty-state__title {
  margin: 0;
  font-size: var(--font-size-lead);
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
