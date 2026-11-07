<script setup lang="ts">
import { reactive, ref, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseButton from '@/components/BaseButton.vue';
import BaseSheet from '@/components/BaseSheet.vue';
import FormAlert from '@/components/FormAlert.vue';
import FormField from '@/components/FormField.vue';
import NumberField from '@/components/NumberField.vue';
import { menuApi } from '../api';
import { describeMenuError, type Message } from '../errors';
import { DEFAULT_LATE_MINUTES, MAX_LATE_MINUTES, MIN_LATE_MINUTES } from '../limits';
import type { Station } from '../types';

const props = defineProps<{ station?: Station }>();
const emit = defineEmits<{ saved: [station: Station]; close: [] }>();
const { t } = useI18n();
const formId = useId();

const form = reactive({
  name: props.station?.name ?? '',
  late: String(props.station?.lateAfterMinutes ?? DEFAULT_LATE_MINUTES),
});
const fieldErrors = ref<Record<string, Message>>({});
const formError = ref<Message>();
const busy = ref(false);

const errorFor = (field: string): string | undefined => {
  const message = fieldErrors.value[field];
  return message ? t(message.key, message.params ?? {}) : undefined;
};

const submit = async () => {
  fieldErrors.value = {};
  formError.value = undefined;
  const late = Number(form.late.trim());
  if (!/^\d+$/u.test(form.late.trim()) || late < MIN_LATE_MINUTES || late > MAX_LATE_MINUTES) {
    fieldErrors.value = { lateAfterMinutes: { key: 'menu.errors.late' } };
    return;
  }
  busy.value = true;
  try {
    const input = { name: form.name, lateAfterMinutes: late };
    const saved = props.station
      ? await menuApi.updateStation(props.station.id, input)
      : await menuApi.createStation(input);
    emit('saved', saved);
  } catch (error: unknown) {
    const described = describeMenuError(error, 'station');
    fieldErrors.value = described.fields;
    formError.value = described.form;
  } finally {
    busy.value = false;
  }
};
</script>

<template>
  <BaseSheet
    open
    :title="station ? t('menu.station.editTitle') : t('menu.station.newTitle')"
    @close="!busy && emit('close')"
  >
    <form :id="formId" class="station-sheet" novalidate @submit.prevent="submit">
      <FormAlert v-if="formError" :message="t(formError.key, formError.params ?? {})" />
      <FormField
        v-model="form.name"
        :label="t('menu.station.name')"
        :hint="t('menu.station.nameHint')"
        :error="errorFor('name')"
        required
      />
      <NumberField
        v-model="form.late"
        :label="t('menu.station.late')"
        :unit="t('menu.station.unit')"
        :hint="t('menu.station.lateHint')"
        :error="errorFor('lateAfterMinutes')"
      />
    </form>
    <template #actions>
      <BaseButton variant="secondary" :disabled="busy" @click="emit('close')">
        {{ t('menu.cancel') }}
      </BaseButton>
      <BaseButton type="submit" :form="formId" :loading="busy">{{ t('menu.save') }}</BaseButton>
    </template>
  </BaseSheet>
</template>

<style scoped>
.station-sheet {
  display: grid;
  gap: var(--space-3);
}
</style>
