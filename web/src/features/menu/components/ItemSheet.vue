<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseButton from '@/components/BaseButton.vue';
import BaseSheet from '@/components/BaseSheet.vue';
import FormAlert from '@/components/FormAlert.vue';
import FormField from '@/components/FormField.vue';
import NumberField from '@/components/NumberField.vue';
import SelectField from '@/components/SelectField.vue';
import TextAreaField from '@/components/TextAreaField.vue';
import { menuApi } from '../api';
import { describeMenuError, type Message } from '../errors';
import { MAX_ITEM_DESCRIPTION } from '../limits';
import { parsePrice, priceInputText, type PriceProblem } from '../price';
import type { Category, MenuItem, Station } from '../types';

const props = defineProps<{
  item?: MenuItem;
  categories: Category[];
  stations: Station[];
  categoryId?: string;
}>();
const emit = defineEmits<{ saved: [item: MenuItem]; remove: [item: MenuItem]; close: [] }>();
const { t } = useI18n();

const form = reactive({
  name: props.item?.name ?? '',
  price: props.item ? priceInputText(props.item.priceVnd) : '',
  categoryId: props.item?.categoryId ?? props.categoryId ?? props.categories[0]?.id ?? '',
  stationId: props.item?.stationId ?? props.stations[0]?.id ?? '',
  description: props.item?.description ?? '',
});
const fieldErrors = ref<Record<string, Message>>({});
const formError = ref<Message>();
const busy = ref(false);

const categoryOptions = computed(() =>
  props.categories.map((c) => ({ value: c.id, label: c.name })),
);
const stationOptions = computed(() => props.stations.map((s) => ({ value: s.id, label: s.name })));

const PRICE_PROBLEM_KEYS: Record<PriceProblem, string> = {
  empty: 'menu.errors.priceEmpty',
  not_whole: 'menu.errors.priceNotWhole',
  too_small: 'menu.errors.priceTooSmall',
  too_big: 'menu.errors.priceTooBig',
};

const errorFor = (field: string): string | undefined => {
  const message = fieldErrors.value[field];
  return message ? t(message.key, message.params ?? {}) : undefined;
};

const submit = async () => {
  fieldErrors.value = {};
  formError.value = undefined;
  const price = parsePrice(form.price);
  if (!price.ok) {
    fieldErrors.value = { priceVnd: { key: PRICE_PROBLEM_KEYS[price.problem] } };
    return;
  }
  const input = {
    name: form.name,
    priceVnd: price.value,
    categoryId: form.categoryId,
    stationId: form.stationId,
    description: form.description,
  };
  busy.value = true;
  try {
    const saved = props.item
      ? await menuApi.updateItem(props.item.id, input)
      : await menuApi.createItem(input);
    emit('saved', saved);
  } catch (error: unknown) {
    const described = describeMenuError(error, 'item');
    fieldErrors.value = described.fields;
    formError.value = described.form;
  } finally {
    busy.value = false;
  }
};
</script>

<template>
  <BaseSheet
    :title="item ? t('menu.item.editTitle') : t('menu.item.newTitle')"
    :close-label="t('menu.close')"
    @close="emit('close')"
  >
    <form class="item-sheet" novalidate @submit.prevent="submit">
      <FormAlert v-if="formError" :message="t(formError.key, formError.params ?? {})" />
      <FormField
        v-model="form.name"
        :label="t('menu.item.name')"
        :hint="t('menu.item.nameHint')"
        :error="errorFor('name')"
        required
      />
      <NumberField
        v-model="form.price"
        :label="t('menu.item.price')"
        unit="₫"
        :hint="t('menu.item.priceHint')"
        :error="errorFor('priceVnd')"
      />
      <div class="item-sheet__pair">
        <SelectField
          v-model="form.categoryId"
          :label="t('menu.item.category')"
          :options="categoryOptions"
          :error="errorFor('categoryId')"
        />
        <SelectField
          v-model="form.stationId"
          :label="t('menu.item.station')"
          :options="stationOptions"
          :error="errorFor('stationId')"
        />
      </div>
      <TextAreaField
        v-model="form.description"
        :label="t('menu.item.description')"
        :hint="t('menu.item.descriptionHint')"
        :maxlength="MAX_ITEM_DESCRIPTION"
        :error="errorFor('description')"
      />
      <div class="item-sheet__actions">
        <BaseButton
          v-if="item"
          variant="ghost"
          class="item-sheet__remove"
          @click="emit('remove', item)"
        >
          {{ t('menu.item.remove') }}
        </BaseButton>
        <BaseButton type="submit" size="lg" :loading="busy">{{ t('menu.save') }}</BaseButton>
      </div>
    </form>
  </BaseSheet>
</template>

<style scoped>
.item-sheet {
  display: grid;
  gap: var(--space-3);
}

.item-sheet__pair {
  display: grid;
  gap: var(--space-3);
}

@media (width >= 600px) {
  .item-sheet__pair {
    grid-template-columns: 1fr 1fr;
  }
}

.item-sheet__actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
  margin-block-start: var(--space-2);
}

.item-sheet__actions > :last-child {
  flex: 1;
}

.item-sheet__remove {
  color: var(--color-danger);
}

@media (width >= 600px) {
  .item-sheet__actions > :last-child {
    flex: 0 1 12rem;
  }
}
</style>
