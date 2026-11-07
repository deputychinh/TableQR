<script setup lang="ts">
import { nextTick, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseButton from '@/components/BaseButton.vue';
import BaseSheet from '@/components/BaseSheet.vue';
import FormAlert from '@/components/FormAlert.vue';
import FormField from '@/components/FormField.vue';
import NumberStepper from '@/components/NumberStepper.vue';
import type { TableInput, TableItem } from '../api';
import { describeTableError, type TableFormErrors } from '../errors';

const NAME_MAX = 30;
const SEATS_MIN = 1;
const SEATS_MAX = 30;
const DEFAULT_SEATS = 4;

/** Add a table (no `table`) or edit one; the parent performs the save and may reject it. */
const props = defineProps<{
  open: boolean;
  table?: TableItem;
  save: (input: TableInput) => Promise<void>;
}>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const form = reactive({ name: '', seats: DEFAULT_SEATS });
const errors = ref<TableFormErrors>({});
const busy = ref(false);
const nameField = ref<InstanceType<typeof FormField> | null>(null);

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    form.name = props.table?.name ?? '';
    form.seats = props.table?.seats ?? DEFAULT_SEATS;
    errors.value = {};
    await nextTick();
    nameField.value?.focus();
  },
  { immediate: true },
);

/** Same limits as the API (domain/table-rules.ts) so most mistakes never leave the phone. */
const validate = (): TableFormErrors => {
  const found: TableFormErrors = {};
  const length = Array.from(form.name.trim()).length;
  if (length < 1 || length > NAME_MAX) found.name = 'tables.errors.name';
  if (!Number.isInteger(form.seats) || form.seats < SEATS_MIN || form.seats > SEATS_MAX) {
    found.seats = 'tables.errors.seats';
  }
  return found;
};

const submit = async () => {
  errors.value = validate();
  if (errors.value.name || errors.value.seats) {
    if (errors.value.name) nameField.value?.focus();
    return;
  }
  busy.value = true;
  try {
    await props.save({ name: form.name.trim(), seats: form.seats });
  } catch (error: unknown) {
    errors.value = describeTableError(error);
    if (errors.value.name) nameField.value?.focus();
  } finally {
    busy.value = false;
  }
};

const message = (key: string | undefined) => (key ? t(key) : undefined);
</script>

<template>
  <BaseSheet
    :open="open"
    :title="table ? t('tables.form.editTitle', { name: table.name }) : t('tables.form.addTitle')"
    @close="!busy && emit('close')"
  >
    <form id="table-form" class="table-form" novalidate @submit.prevent="submit">
      <FormAlert v-if="errors.form" :message="t(errors.form)" />
      <FormField
        ref="nameField"
        v-model="form.name"
        :label="t('tables.form.name')"
        :hint="t('tables.form.nameHint')"
        :error="message(errors.name)"
        required
      />
      <NumberStepper
        v-model="form.seats"
        :label="t('tables.form.seats')"
        :hint="t('tables.form.seatsHint')"
        :error="message(errors.seats)"
        :min="SEATS_MIN"
        :max="SEATS_MAX"
        :decrement-label="t('tables.form.fewer')"
        :increment-label="t('tables.form.more')"
      />
    </form>
    <template #actions>
      <BaseButton variant="secondary" :disabled="busy" @click="emit('close')">
        {{ t('tables.form.cancel') }}
      </BaseButton>
      <BaseButton type="submit" form="table-form" :loading="busy">
        {{ table ? t('tables.form.save') : t('tables.form.create') }}
      </BaseButton>
    </template>
  </BaseSheet>
</template>

<style scoped>
.table-form {
  display: grid;
  gap: var(--space-4);
}
</style>
