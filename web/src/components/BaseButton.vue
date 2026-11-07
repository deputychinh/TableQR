<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
    size?: 'md' | 'lg';
    type?: 'button' | 'submit';
    loading?: boolean;
    disabled?: boolean;
    block?: boolean;
  }>(),
  { variant: 'primary', size: 'md', type: 'button', loading: false, disabled: false, block: false },
);
</script>

<template>
  <button
    :type="type"
    class="base-button"
    :class="[
      `base-button--${variant}`,
      `base-button--${size}`,
      { 'base-button--block': block, 'base-button--loading': loading },
    ]"
    :disabled="disabled || loading"
    :aria-busy="loading"
  >
    <span v-if="loading" class="base-button__spinner" aria-hidden="true" />
    <slot />
  </button>
</template>

<style scoped>
.base-button {
  display: inline-flex;
  gap: var(--space-2);
  align-items: center;
  justify-content: center;
  min-block-size: var(--target-min);
  padding-inline: var(--space-4);
  border: 1px solid transparent;
  border-radius: var(--radius-2);
  font: inherit;
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: background-color var(--duration-fast) ease-out;
}

.base-button--lg {
  min-block-size: var(--target-large);
  font-size: var(--font-size-lead);
}

.base-button--block {
  inline-size: 100%;
}

.base-button--primary {
  color: var(--color-on-primary);
  background: var(--color-primary);
}

.base-button--secondary {
  color: var(--color-text);
  background: var(--color-surface);
  border-color: var(--color-border-strong);
}

.base-button--danger {
  color: var(--color-on-primary);
  background: var(--color-danger);
}

.base-button--ghost {
  color: var(--color-primary);
  background: transparent;
}

@media (hover: hover) {
  .base-button--primary:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .base-button--secondary:hover:not(:disabled),
  .base-button--ghost:hover:not(:disabled) {
    background: var(--color-surface-muted);
  }
}

.base-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.base-button__spinner {
  inline-size: 1em;
  block-size: 1em;
  border: 2px solid currentcolor;
  border-inline-end-color: transparent;
  border-radius: 50%;
  animation: base-button-spin 0.8s linear infinite;
}

@keyframes base-button-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
