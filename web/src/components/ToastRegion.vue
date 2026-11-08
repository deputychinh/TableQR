<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { CircleAlert, CircleCheck, X } from 'lucide-vue-next';
import IconButton from '@/components/IconButton.vue';
import { useToastStore } from '@/stores/toast';

/**
 * The one place action outcomes appear (design system `Toast`). The live region is always in the
 * page so screen readers announce each message politely; pages call `useToast().success(…)`.
 */
const { t } = useI18n();
const toasts = useToastStore();
</script>

<template>
  <div class="toast-region" role="status" aria-live="polite">
    <div
      v-if="toasts.current"
      :key="toasts.current.id"
      class="toast"
      :class="`toast--${toasts.current.tone}`"
    >
      <CircleCheck
        v-if="toasts.current.tone === 'success'"
        class="toast__icon"
        :size="20"
        aria-hidden="true"
      />
      <CircleAlert v-else class="toast__icon" :size="20" aria-hidden="true" />
      <p class="toast__message">{{ toasts.current.message }}</p>
      <IconButton :icon="X" :label="t('toast.close')" :icon-size="18" @click="toasts.dismiss()" />
    </div>
  </div>
</template>

<style scoped>
.toast-region {
  position: fixed;
  inset-inline: var(--space-3);
  inset-block-end: calc(var(--target-large) + var(--space-4));
  z-index: var(--z-toast);
  display: grid;
  justify-items: center;
  pointer-events: none;
}

.toast {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  max-inline-size: 32rem;
  padding: var(--space-1) var(--space-1) var(--space-1) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  color: var(--color-text);
  background: var(--color-surface);
  box-shadow: var(--shadow-2);
  pointer-events: auto;
}

.toast--success {
  border-inline-start: 4px solid var(--color-primary);
}

.toast--error {
  border-inline-start: 4px solid var(--color-danger);
}

.toast__icon {
  flex: none;
}

.toast--success .toast__icon {
  color: var(--color-primary);
}

.toast--error .toast__icon {
  color: var(--color-danger);
}

.toast__message {
  margin: 0;
}

@media (width >= 840px) {
  .toast-region {
    inset-block-end: var(--space-5);
  }
}
</style>
