<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseButton from '@/components/BaseButton.vue';
import BaseSheet from '@/components/BaseSheet.vue';
import TextAreaField from '@/components/TextAreaField.vue';
import { SKIP_REASON_MAX } from '../services/kitchen.service';

/**
 * AC32: an older table ordered the same dish and is still waiting. The cook may still finish this
 * one first, but only with a reason, which is recorded on the item.
 */
const props = defineProps<{ open: boolean; dish: string; tables: string[]; busy: boolean }>();
const emit = defineEmits<{ confirm: [reason: string]; cancel: [] }>();
const { t } = useI18n();

const reason = ref('');
const error = ref<string | undefined>();

watch(
  () => props.open,
  (open) => {
    if (open) {
      reason.value = '';
      error.value = undefined;
    }
  },
);

const submit = () => {
  const trimmed = reason.value.trim();
  if (trimmed === '') {
    error.value = t('kitchen.skip.required');
    return;
  }
  emit('confirm', trimmed);
};
</script>

<template>
  <BaseSheet :open="open" :title="t('kitchen.skip.title')" @close="!busy && emit('cancel')">
    <p class="skip-reason-sheet__body">
      {{
        tables.length > 0
          ? t('kitchen.skip.body', { tables: tables.join(', '), dish })
          : t('kitchen.skip.bodyOther', { dish })
      }}
    </p>
    <TextAreaField
      v-model="reason"
      :label="t('kitchen.skip.reason')"
      :hint="t('kitchen.skip.hint')"
      :error="error"
      :maxlength="SKIP_REASON_MAX"
      :rows="2"
    />
    <template #actions>
      <BaseButton variant="secondary" size="lg" :disabled="busy" @click="emit('cancel')">
        {{ t('kitchen.skip.cancel') }}
      </BaseButton>
      <BaseButton size="lg" :loading="busy" @click="submit">
        {{ t('kitchen.skip.confirm') }}
      </BaseButton>
    </template>
  </BaseSheet>
</template>

<style scoped>
.skip-reason-sheet__body {
  margin: 0;
  font-size: var(--font-size-lead);
}
</style>
