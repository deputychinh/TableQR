<script setup lang="ts">
import { CircleAlert } from 'lucide-vue-next';

defineProps<{ message: string }>();
</script>

<template>
  <div class="form-alert" role="alert">
    <CircleAlert :size="20" aria-hidden="true" />
    <span>{{ message }}</span>
  </div>
</template>

<style scoped>
.form-alert {
  display: flex;
  gap: var(--space-2);
  align-items: flex-start;
  padding: var(--space-3);
  border-radius: var(--radius-1);
  color: var(--color-danger);
  background: var(--color-danger-bg);
}
</style>
