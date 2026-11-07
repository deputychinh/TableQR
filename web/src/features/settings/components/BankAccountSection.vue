<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Landmark } from 'lucide-vue-next';
import FormField from '@/components/FormField.vue';
import SelectField from '@/components/SelectField.vue';
import {
  type Bank,
  type BankDraft,
  type FieldErrors,
  digitsOnly,
  normalizeAccountName,
} from '@/features/settings/model';

/** Bank, account number and holder name, with a live preview of what guests will see. */
const props = defineProps<{ banks: readonly Bank[]; errors: FieldErrors }>();
const model = defineModel<BankDraft>({ required: true });
const { t } = useI18n();

const bankOptions = computed(() => [
  { value: '', label: t('settings.bank.none') },
  ...props.banks.map((bank) => ({ value: bank.bin, label: bank.shortName })),
]);

const field = <K extends keyof BankDraft>(key: K) =>
  computed({
    get: () => model.value[key],
    set: (value: string) => {
      model.value = { ...model.value, [key]: value };
    },
  });
const binValue = field('bin');
/** "No account" clears the number and name, so removing the account is one choice. */
const bin = computed({
  get: () => binValue.value,
  set: (value: string) => {
    model.value =
      value === ''
        ? { bin: '', accountNumber: '', accountName: '' }
        : { ...model.value, bin: value };
  },
});
const accountNumber = field('accountNumber');
const accountName = field('accountName');

const bankName = computed(() => props.banks.find((bank) => bank.bin === bin.value)?.shortName);
const previewNumber = computed(() => digitsOnly(accountNumber.value));
const previewName = computed(() => normalizeAccountName(accountName.value));
const message = (path: string): string | undefined => {
  const key = props.errors[path];
  return key ? t(key) : undefined;
};
</script>

<template>
  <div class="bank-account">
    <SelectField
      v-model="bin"
      :label="t('settings.bank.bank')"
      :options="bankOptions"
      :error="message('bank.bin')"
    />
    <template v-if="bin !== ''">
      <FormField
        v-model="accountNumber"
        :label="t('settings.bank.accountNumber')"
        :hint="t('settings.bank.accountNumberHint')"
        inputmode="numeric"
        :error="message('bank.accountNumber')"
      />
      <FormField
        v-model="accountName"
        :label="t('settings.bank.accountName')"
        :hint="t('settings.bank.accountNameHint')"
        autocomplete="name"
        :error="message('bank.accountName')"
      />
    </template>
    <div class="bank-account__preview" data-testid="bank-preview">
      <span class="bank-account__preview-icon"><Landmark :size="22" aria-hidden="true" /></span>
      <div class="bank-account__preview-text">
        <span class="bank-account__preview-label">{{ t('settings.bank.preview') }}</span>
        <template v-if="bin !== ''">
          <span class="bank-account__preview-bank">{{ bankName }}</span>
          <span class="bank-account__preview-number">{{ previewNumber || '—' }}</span>
          <span class="bank-account__preview-name">{{ previewName || '—' }}</span>
        </template>
        <span v-else class="bank-account__preview-empty">{{
          t('settings.bank.previewEmpty')
        }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bank-account {
  display: grid;
  gap: var(--space-4);
}

.bank-account__preview {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
  padding: var(--space-3);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-2);
  background: var(--color-surface-muted);
}

.bank-account__preview-icon {
  display: grid;
  flex: none;
  place-items: center;
  inline-size: 2.5rem;
  block-size: 2.5rem;
  border-radius: 50%;
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.bank-account__preview-text {
  display: grid;
  gap: var(--space-1);
  min-inline-size: 0;
}

.bank-account__preview-label {
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
}

.bank-account__preview-bank {
  font-weight: var(--font-weight-medium);
}

.bank-account__preview-number {
  font-size: var(--font-size-lead);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  overflow-wrap: anywhere;
}

.bank-account__preview-name {
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.02em;
  overflow-wrap: anywhere;
}
</style>
