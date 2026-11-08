<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Minus, Plus } from 'lucide-vue-next';
import BaseButton from '@/components/BaseButton.vue';

/** "Thêm" for a dish not in the cart yet, then big − / count / + buttons (targets ≥ 44 px). */
defineProps<{ name: string; quantity: number; canAdd: boolean }>();
const emit = defineEmits<{ add: []; remove: [] }>();
const { t } = useI18n();
</script>

<template>
  <BaseButton
    v-if="quantity === 0"
    variant="secondary"
    :disabled="!canAdd"
    :aria-label="t('ordering.menu.addOne', { name })"
    @click="emit('add')"
  >
    <Plus :size="18" aria-hidden="true" />
    {{ t('ordering.menu.add') }}
  </BaseButton>
  <span v-else class="item-quantity">
    <button
      type="button"
      class="item-quantity__button"
      :aria-label="t('ordering.menu.removeOne', { name })"
      @click="emit('remove')"
    >
      <Minus :size="20" aria-hidden="true" />
    </button>
    <span class="item-quantity__count" aria-live="polite">
      <span class="item-quantity__number" aria-hidden="true">{{ quantity }}</span>
      <span class="item-quantity__label">{{ t('ordering.menu.inCart', { n: quantity }) }}</span>
    </span>
    <button
      type="button"
      class="item-quantity__button item-quantity__button--add"
      :aria-label="t('ordering.menu.addOne', { name })"
      :disabled="!canAdd"
      @click="emit('add')"
    >
      <Plus :size="20" aria-hidden="true" />
    </button>
  </span>
</template>

<style scoped>
.item-quantity {
  display: inline-flex;
  gap: var(--space-2);
  align-items: center;
}

.item-quantity__button {
  display: grid;
  place-items: center;
  inline-size: var(--target-min);
  block-size: var(--target-min);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-2);
  color: var(--color-text);
  background: var(--color-surface);
  cursor: pointer;
}

.item-quantity__button--add {
  border-color: var(--color-primary);
  color: var(--color-on-primary);
  background: var(--color-primary);
}

.item-quantity__button:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.item-quantity__count {
  min-inline-size: 1.5rem;
  font-size: var(--font-size-lead);
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
  text-align: center;
}

/* The number is shown; "n trong giỏ" is read by screen readers only. */
.item-quantity__label {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
