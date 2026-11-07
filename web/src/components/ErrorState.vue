<script setup lang="ts">
import { CircleAlert } from 'lucide-vue-next';
import BaseButton from './BaseButton.vue';

/** Load failed: a plain cause and, when it can help, a retry button. */
defineProps<{ message: string; retryLabel?: string }>();
const emit = defineEmits<{ retry: [] }>();
</script>

<template>
  <div class="error-state" role="alert">
    <CircleAlert :size="32" aria-hidden="true" class="error-state__icon" />
    <p class="error-state__message">{{ message }}</p>
    <BaseButton v-if="retryLabel" variant="secondary" @click="emit('retry')">
      {{ retryLabel }}
    </BaseButton>
  </div>
</template>

<style scoped>
.error-state {
  display: grid;
  gap: var(--space-3);
  justify-items: center;
  padding: var(--space-5) var(--space-3);
  border-radius: var(--radius-2);
  text-align: center;
  background: var(--color-surface);
}

.error-state__icon {
  color: var(--color-danger);
}

.error-state__message {
  margin: 0;
}
</style>
