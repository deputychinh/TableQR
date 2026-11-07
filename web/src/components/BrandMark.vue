<script setup lang="ts">
import { QrCode } from 'lucide-vue-next';
</script>

<template>
  <span class="brand-mark">
    <span class="brand-mark__icon"><QrCode :size="20" aria-hidden="true" /></span>
    <span class="brand-mark__name">TableQR</span>
  </span>
</template>

<style scoped>
.brand-mark {
  display: inline-flex;
  gap: var(--space-2);
  align-items: center;
  font-weight: var(--font-weight-bold);
  font-size: var(--font-size-lead);
  color: var(--color-text);
}

.brand-mark__icon {
  display: grid;
  place-items: center;
  inline-size: 2rem;
  block-size: 2rem;
  border-radius: var(--radius-1);
  color: var(--color-on-primary);
  background: var(--color-primary);
}
</style>
