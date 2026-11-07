<script setup lang="ts">
import { reactive, ref, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseButton from '@/components/BaseButton.vue';
import BaseSheet from '@/components/BaseSheet.vue';
import FormAlert from '@/components/FormAlert.vue';
import FormField from '@/components/FormField.vue';
import ToggleSwitch from '@/components/ToggleSwitch.vue';
import { menuApi } from '../api';
import { describeMenuError, type Message } from '../errors';
import type { Category } from '../types';

const props = defineProps<{ category?: Category; hint?: string }>();
const emit = defineEmits<{ saved: [category: Category]; close: [] }>();
const { t } = useI18n();
const formId = useId();

const form = reactive({
  name: props.category?.name ?? '',
  isMain: props.category?.isMain ?? false,
});
const nameError = ref<Message>();
const formError = ref<Message>();
const busy = ref(false);

const submit = async () => {
  nameError.value = undefined;
  formError.value = undefined;
  busy.value = true;
  try {
    const input = { name: form.name, isMain: form.isMain };
    const saved = props.category
      ? await menuApi.updateCategory(props.category.id, input)
      : await menuApi.createCategory(input);
    emit('saved', saved);
  } catch (error: unknown) {
    const described = describeMenuError(error, 'category');
    nameError.value = described.fields.name;
    formError.value = described.form;
  } finally {
    busy.value = false;
  }
};
</script>

<template>
  <BaseSheet
    open
    :title="category ? t('menu.category.editTitle') : t('menu.category.newTitle')"
    @close="!busy && emit('close')"
  >
    <form :id="formId" class="category-sheet" novalidate @submit.prevent="submit">
      <p v-if="hint" class="category-sheet__hint">{{ hint }}</p>
      <FormAlert v-if="formError" :message="t(formError.key, formError.params ?? {})" />
      <FormField
        v-model="form.name"
        :label="t('menu.category.name')"
        :hint="t('menu.category.nameHint')"
        :error="nameError ? t(nameError.key, nameError.params ?? {}) : undefined"
        required
      />
      <div class="category-sheet__main">
        <ToggleSwitch
          v-model="form.isMain"
          :label="t('menu.category.isMain')"
          :state-text="t('menu.category.isMain')"
        />
        <p class="category-sheet__main-hint">{{ t('menu.category.isMainHint') }}</p>
      </div>
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
.category-sheet {
  display: grid;
  gap: var(--space-3);
}

.category-sheet__hint {
  margin: 0;
  padding: var(--space-3);
  border-radius: var(--radius-1);
  background: var(--color-primary-soft);
}

.category-sheet__main {
  display: grid;
  gap: var(--space-1);
}

.category-sheet__main-hint {
  margin: 0;
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
}
</style>
