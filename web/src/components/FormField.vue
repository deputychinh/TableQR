<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import { Eye, EyeOff } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';

const props = withDefaults(
  defineProps<{
    label: string;
    type?: 'text' | 'email' | 'password';
    autocomplete?: string;
    hint?: string;
    error?: string;
    required?: boolean;
  }>(),
  { type: 'text', autocomplete: 'off', hint: undefined, error: undefined, required: false },
);
const model = defineModel<string>({ required: true });
const { t } = useI18n();
const id = useId();
const reveal = ref(false);
const inputType = computed(() => (props.type === 'password' && reveal.value ? 'text' : props.type));
const describedBy = computed(
  () =>
    [props.hint ? `${id}-hint` : '', props.error ? `${id}-error` : ''].filter(Boolean).join(' ') ||
    undefined,
);
const input = ref<HTMLInputElement | null>(null);
defineExpose({ focus: () => input.value?.focus() });
</script>

<template>
  <div class="form-field" :class="{ 'form-field--invalid': error }">
    <label class="form-field__label" :for="id">{{ label }}</label>
    <div class="form-field__control">
      <input
        :id="id"
        ref="input"
        v-model="model"
        class="form-field__input"
        :type="inputType"
        :autocomplete="autocomplete"
        :required="required"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
      />
      <button
        v-if="type === 'password'"
        type="button"
        class="form-field__reveal"
        :aria-label="reveal ? t('form.hidePassword') : t('form.showPassword')"
        :aria-pressed="reveal"
        @click="reveal = !reveal"
      >
        <EyeOff v-if="reveal" :size="20" aria-hidden="true" />
        <Eye v-else :size="20" aria-hidden="true" />
      </button>
    </div>
    <p v-if="hint" :id="`${id}-hint`" class="form-field__hint">{{ hint }}</p>
    <p v-if="error" :id="`${id}-error`" class="form-field__error">{{ error }}</p>
  </div>
</template>

<style scoped>
.form-field {
  display: grid;
  gap: var(--space-1);
}

.form-field__label {
  font-weight: var(--font-weight-medium);
}

.form-field__control {
  position: relative;
}

.form-field__input {
  inline-size: 100%;
  min-block-size: var(--target-min);
  padding-inline: var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-1);
  font: inherit;
  color: var(--color-text);
  background: var(--color-surface);
}

.form-field--invalid .form-field__input {
  border-color: var(--color-danger);
  border-width: 2px;
}

.form-field__reveal {
  position: absolute;
  inset-block: 0;
  inset-inline-end: 0;
  display: grid;
  place-items: center;
  inline-size: var(--target-min);
  border: 0;
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.form-field__hint {
  margin: 0;
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
}

.form-field__error {
  margin: 0;
  font-size: var(--font-size-small);
  color: var(--color-danger);
}
</style>
