<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import BaseButton from '@/components/BaseButton.vue';
import BaseSheet from '@/components/BaseSheet.vue';
import FormAlert from '@/components/FormAlert.vue';
import TextAreaField from '@/components/TextAreaField.vue';
import { formatVnd } from '@/features/menu/price';
import { CART_LIMITS, canAdd, type CartItemRef, type CartLine } from '../cart';
import ItemQuantity from './ItemQuantity.vue';

/** Review the cart before sending: quantities, a note per dish, the total and "Gửi món". */
const props = defineProps<{
  open: boolean;
  cart: readonly CartLine[];
  total: number;
  submitting: boolean;
  /** Why the last submission did not go through (menu changed, network). */
  alert?: string;
}>();
const emit = defineEmits<{
  close: [];
  add: [item: CartItemRef];
  remove: [menuItemId: string];
  note: [menuItemId: string, text: string];
  submit: [];
}>();
const { t } = useI18n();

const refOf = (line: CartLine): CartItemRef => ({
  id: line.menuItemId,
  name: line.name,
  priceVnd: line.priceVnd,
});
</script>

<template>
  <BaseSheet :open="open" :title="t('ordering.cart.title')" @close="emit('close')">
    <FormAlert v-if="alert" :message="alert" />
    <p v-if="props.cart.length === 0" class="cart-sheet__empty">{{ t('ordering.cart.empty') }}</p>
    <ul v-else class="cart-sheet__lines">
      <li v-for="line in props.cart" :key="line.menuItemId" class="cart-sheet__line">
        <div class="cart-sheet__row">
          <span class="cart-sheet__name">{{ line.name }}</span>
          <span class="cart-sheet__price">{{ formatVnd(line.priceVnd * line.quantity) }}</span>
        </div>
        <ItemQuantity
          :name="line.name"
          :quantity="line.quantity"
          :can-add="canAdd(props.cart, line.menuItemId)"
          @add="emit('add', refOf(line))"
          @remove="emit('remove', line.menuItemId)"
        />
        <TextAreaField
          :model-value="line.note"
          :label="t('ordering.cart.note', { name: line.name })"
          :hint="t('ordering.cart.noteHint', { max: CART_LIMITS.maxNoteLength })"
          :maxlength="CART_LIMITS.maxNoteLength"
          :rows="2"
          @update:model-value="(text: string) => emit('note', line.menuItemId, text)"
        />
      </li>
    </ul>
    <p class="cart-sheet__total">
      <span>{{ t('ordering.cart.total') }}</span>
      <strong>{{ formatVnd(total) }}</strong>
    </p>
    <template #actions>
      <BaseButton variant="secondary" size="lg" @click="emit('close')">
        {{ t('ordering.cart.close') }}
      </BaseButton>
      <BaseButton
        size="lg"
        :loading="submitting"
        :disabled="props.cart.length === 0"
        @click="emit('submit')"
      >
        {{ submitting ? t('ordering.cart.submitting') : t('ordering.cart.submit') }}
      </BaseButton>
    </template>
  </BaseSheet>
</template>

<style scoped>
.cart-sheet__empty {
  margin: 0;
  color: var(--color-text-muted);
}

.cart-sheet__lines {
  display: grid;
  gap: var(--space-3);
  max-block-size: 55dvh;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.cart-sheet__line {
  display: grid;
  gap: var(--space-2);
  padding-block-end: var(--space-3);
  border-block-end: 1px solid var(--color-border);
}

.cart-sheet__row {
  display: flex;
  gap: var(--space-3);
  justify-content: space-between;
}

.cart-sheet__name {
  font-weight: var(--font-weight-bold);
  overflow-wrap: anywhere;
}

.cart-sheet__price {
  flex: none;
  font-variant-numeric: tabular-nums;
}

.cart-sheet__total {
  display: flex;
  justify-content: space-between;
  margin: 0;
  font-size: var(--font-size-lead);
}
</style>
