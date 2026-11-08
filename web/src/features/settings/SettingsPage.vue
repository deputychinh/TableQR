<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { onBeforeRouteLeave } from 'vue-router';
import { ApiError } from '@/api/client';
import OwnerShell from '@/app/layouts/OwnerShell.vue';
import BaseButton from '@/components/BaseButton.vue';
import ConfirmSheet from '@/components/ConfirmSheet.vue';
import ErrorState from '@/components/ErrorState.vue';
import FormAlert from '@/components/FormAlert.vue';
import FormField from '@/components/FormField.vue';
import LoadingState from '@/components/LoadingState.vue';
import NumberStepper from '@/components/NumberStepper.vue';
import RadioCardGroup from '@/components/RadioCardGroup.vue';
import { useToastStore } from '@/stores/toast';
import BankAccountSection from './components/BankAccountSection.vue';
import OpeningHoursEditor from './components/OpeningHoursEditor.vue';
import {
  type BankDraft,
  type FieldErrors,
  type HouseRules,
  ORDER_APPROVALS,
  type OwnerSettings,
  PAYMENT_TIMINGS,
  REMINDER_MINUTES,
  type ReminderMinutes,
  RULE_LIMITS,
  SESSION_OPENINGS,
  bankOfDraft,
  checkDraft,
  draftOf,
  messageForPath,
} from './model';
import { loadSettings, saveSettings } from './settings-api';

const { t } = useI18n();

type LoadState = 'loading' | 'ready' | 'failed' | 'forbidden';
const state = ref<LoadState>('loading');
const saved = ref<OwnerSettings>();
const rules = ref<HouseRules>();
const bank = ref<BankDraft>({ bin: '', accountNumber: '', accountName: '' });
const errors = ref<FieldErrors>({});
const formError = ref<string>();
const toast = useToastStore();
const busy = ref(false);
const confirmBank = ref(false);
// Step-up (TQR-023): typed into the bank sheet, sent once with that save, then cleared; never
// kept in a store or the browser's storage.
const currentPassword = ref('');
const passwordError = ref<string>();
const passwordField = ref<InstanceType<typeof FormField> | null>(null);
const confirmLeave = ref(false);
let resolveLeave: ((leave: boolean) => void) | undefined;

const apply = (settings: OwnerSettings) => {
  saved.value = settings;
  rules.value = structuredClone(settings.rules);
  bank.value = draftOf(settings.bank);
};

const load = async () => {
  state.value = 'loading';
  try {
    apply(await loadSettings());
    state.value = 'ready';
  } catch (error: unknown) {
    state.value = error instanceof ApiError && error.status === 403 ? 'forbidden' : 'failed';
  }
};
onMounted(load);

const savedBank = computed(() => (saved.value ? bankOfDraft(draftOf(saved.value.bank)) : null));
const bankChanged = computed(
  () => JSON.stringify(bankOfDraft(bank.value)) !== JSON.stringify(savedBank.value),
);
const dirty = computed(
  () =>
    saved.value !== undefined &&
    (bankChanged.value || JSON.stringify(rules.value) !== JSON.stringify(saved.value.rules)),
);
const newBank = computed(() => bankOfDraft(bank.value));
const bankName = computed(
  () => saved.value?.banks.find((b) => b.bin === newBank.value?.bin)?.shortName ?? '',
);

const changedAt = computed(() => {
  const at = saved.value?.bankChangedAt;
  if (!at) return undefined;
  const when = new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(at));
  return t('settings.bank.changedAt', { when });
});

const choices = <T extends string>(group: string, values: readonly T[]) =>
  computed(() =>
    values.map((value) => ({
      value,
      title: t(`settings.${group}.${value}.title`),
      body: t(`settings.${group}.${value}.body`),
    })),
  );
const paymentChoices = choices('payment', PAYMENT_TIMINGS);
const sessionChoices = choices('session', SESSION_OPENINGS);
const approvalChoices = choices('approval', ORDER_APPROVALS);
const bookingChoices = choices('booking', ['on', 'off'] as const);
const booking = computed({
  get: () => (rules.value?.booking.enabled === false ? 'off' : 'on'),
  set: (value: 'on' | 'off') => {
    if (rules.value) rules.value.booking.enabled = value === 'on';
  },
});

/** TQR-028: minutes as radio values (strings), each with a short explanation. */
const minuteChoices = (group: 'reminderBody' | 'repeatBody') =>
  computed(() =>
    REMINDER_MINUTES.map((n) => ({
      value: String(n),
      title: t('settings.kitchen.choice', { n }),
      body: t(`settings.kitchen.${group}.m${String(n)}`),
    })),
  );
const reminderChoices = minuteChoices('reminderBody');
const repeatChoices = minuteChoices('repeatBody');
const minutesOf = (value: string): ReminderMinutes =>
  REMINDER_MINUTES.find((n) => String(n) === value) ?? 10;
const reminderMinutes = computed({
  get: () => String(rules.value?.kitchen.reminderMinutes ?? 10),
  set: (value: string) => {
    if (rules.value) rules.value.kitchen.reminderMinutes = minutesOf(value);
  },
});
const repeatMinutes = computed({
  get: () => String(rules.value?.kitchen.repeatMinutes ?? 10),
  set: (value: string) => {
    if (rules.value) rules.value.kitchen.repeatMinutes = minutesOf(value);
  },
});

const message = (path: string): string | undefined => {
  const key = errors.value[path];
  return key ? t(key) : undefined;
};

/**
 * Focus the first field to fix and bring it to the middle of the window, so neither the header nor
 * the sticky save bar covers it (WCAG 2.4.11; r2 review).
 */
const focusFirstInvalid = async () => {
  await nextTick();
  const field = document.querySelector<HTMLElement>('.settings-page [aria-invalid="true"]');
  if (!field) return;
  field.focus({ preventScroll: true });
  // jsdom has no scrollIntoView; every browser does.
  if (typeof field.scrollIntoView === 'function') field.scrollIntoView({ block: 'center' });
};

/** Answers of the password check that keep the bank sheet open with the reason under the field. */
const PASSWORD_ERRORS: Readonly<Record<string, string>> = {
  REAUTH_FAILED: 'settings.bank.passwordWrong',
  REAUTH_REQUIRED: 'settings.bank.passwordRequired',
  LOGIN_BLOCKED: 'settings.bank.passwordBlocked',
};

const closeBankSheet = () => {
  confirmBank.value = false;
  currentPassword.value = '';
  passwordError.value = undefined;
};

const save = async (password?: string) => {
  if (!rules.value) return;
  busy.value = true;
  formError.value = undefined;
  try {
    apply(
      await saveSettings({
        rules: rules.value,
        bank: newBank.value,
        ...(password === undefined ? {} : { currentPassword: password }),
      }),
    );
    toast.show(t('settings.saved'));
    closeBankSheet();
  } catch (error: unknown) {
    const passwordProblem = error instanceof ApiError ? PASSWORD_ERRORS[error.code] : undefined;
    if (confirmBank.value && passwordProblem) {
      currentPassword.value = '';
      passwordError.value = passwordProblem;
      await nextTick();
      passwordField.value?.focus();
      return;
    }
    closeBankSheet();
    if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') {
      errors.value = Object.fromEntries(error.fields.map((f) => [f.path, messageForPath(f.path)]));
      formError.value = 'settings.fixErrors';
      await focusFirstInvalid();
    } else {
      formError.value =
        error instanceof ApiError && error.code === 'NETWORK'
          ? 'errors.network'
          : 'errors.unexpected';
    }
  } finally {
    busy.value = false;
  }
};

const confirmBankChange = async () => {
  if (busy.value) return;
  if (currentPassword.value === '') {
    passwordError.value = 'settings.bank.passwordRequired';
    passwordField.value?.focus();
    return;
  }
  passwordError.value = undefined;
  await save(currentPassword.value);
};

const requestSave = async () => {
  if (!rules.value || !dirty.value) return;
  errors.value = checkDraft(rules.value, bank.value);
  if (Object.keys(errors.value).length > 0) {
    formError.value = 'settings.fixErrors';
    await focusFirstInvalid();
    return;
  }
  formError.value = undefined;
  if (bankChanged.value) {
    // Money: confirm with the consequence shown and the owner's password (TQR-023).
    currentPassword.value = '';
    passwordError.value = undefined;
    confirmBank.value = true;
  } else await save();
};

// Once errors show, re-check as the owner edits so fixed fields stop being red.
watch(
  [rules, bank],
  () => {
    if (rules.value && Object.keys(errors.value).length > 0) {
      errors.value = checkDraft(rules.value, bank.value);
      if (Object.keys(errors.value).length === 0) formError.value = undefined;
    }
  },
  { deep: true },
);

const answerLeave = (leave: boolean) => {
  confirmLeave.value = false;
  resolveLeave?.(leave);
  resolveLeave = undefined;
};

onBeforeRouteLeave(() => {
  if (!dirty.value) return true;
  confirmLeave.value = true;
  return new Promise<boolean>((resolve) => (resolveLeave = resolve));
});

const onBeforeUnload = (event: BeforeUnloadEvent) => {
  if (dirty.value) event.preventDefault();
};
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload));
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload));
</script>

<template>
  <OwnerShell>
    <div class="settings-page">
      <h1 class="settings-page__title">{{ t('settings.title') }}</h1>
      <p class="settings-page__lead">{{ t('settings.lead') }}</p>

      <LoadingState v-if="state === 'loading'" :label="t('settings.loading')" :rows="4" />
      <ErrorState v-else-if="state === 'forbidden'" :message="t('settings.ownerOnly')" />
      <ErrorState
        v-else-if="state === 'failed'"
        :message="t('settings.loadFailed')"
        :retry-label="t('settings.retry')"
        @retry="load"
      />
      <form
        v-else-if="rules && saved"
        class="settings-page__form"
        novalidate
        @submit.prevent="requestSave"
      >
        <section class="settings-page__section" aria-labelledby="settings-payment">
          <h2 id="settings-payment" class="settings-page__heading">
            {{ t('settings.payment.title') }}
          </h2>
          <RadioCardGroup
            v-model="rules.paymentTiming"
            :legend="t('settings.payment.legend')"
            :options="paymentChoices"
          />
        </section>

        <section class="settings-page__section" aria-labelledby="settings-session">
          <h2 id="settings-session" class="settings-page__heading">
            {{ t('settings.session.title') }}
          </h2>
          <RadioCardGroup
            v-model="rules.sessionOpening"
            :legend="t('settings.session.legend')"
            :options="sessionChoices"
          />
        </section>

        <section class="settings-page__section" aria-labelledby="settings-approval">
          <h2 id="settings-approval" class="settings-page__heading">
            {{ t('settings.approval.title') }}
          </h2>
          <RadioCardGroup
            v-model="rules.orderApproval"
            :legend="t('settings.approval.legend')"
            :options="approvalChoices"
          />
          <h3 class="settings-page__subheading">{{ t('settings.approval.thresholds') }}</h3>
          <div class="settings-page__pair">
            <NumberStepper
              v-model="rules.anomaly.maxMainPerPerson"
              :label="t('settings.approval.max')"
              :hint="t('settings.approval.maxHint')"
              :unit="t('settings.approval.unit')"
              v-bind="RULE_LIMITS.maxMainPerPerson"
              :decrease-label="
                t('settings.stepper.decrease', { label: t('settings.approval.max') })
              "
              :increase-label="
                t('settings.stepper.increase', { label: t('settings.approval.max') })
              "
              :error="message('rules.anomaly.maxMainPerPerson')"
            />
            <NumberStepper
              v-model="rules.anomaly.minMainPerPerson"
              :label="t('settings.approval.min')"
              :hint="t('settings.approval.minHint')"
              :unit="t('settings.approval.unit')"
              v-bind="RULE_LIMITS.minMainPerPerson"
              :decrease-label="
                t('settings.stepper.decrease', { label: t('settings.approval.min') })
              "
              :increase-label="
                t('settings.stepper.increase', { label: t('settings.approval.min') })
              "
              :error="message('rules.anomaly.minMainPerPerson')"
            />
          </div>
        </section>

        <section class="settings-page__section" aria-labelledby="settings-kitchen">
          <h2 id="settings-kitchen" class="settings-page__heading">
            {{ t('settings.kitchen.title') }}
          </h2>
          <p class="settings-page__hint">{{ t('settings.kitchen.lead') }}</p>
          <RadioCardGroup
            v-model="reminderMinutes"
            :legend="t('settings.kitchen.reminderLegend')"
            :options="reminderChoices"
          />
          <RadioCardGroup
            v-model="repeatMinutes"
            :legend="t('settings.kitchen.repeatLegend')"
            :options="repeatChoices"
          />
        </section>

        <section class="settings-page__section" aria-labelledby="settings-booking">
          <h2 id="settings-booking" class="settings-page__heading">
            {{ t('settings.booking.title') }}
          </h2>
          <RadioCardGroup
            v-model="booking"
            :legend="t('settings.booking.legend')"
            :options="bookingChoices"
          />
          <template v-if="rules.booking.enabled">
            <NumberStepper
              v-model="rules.booking.slotMinutes"
              :label="t('settings.booking.slot')"
              :hint="t('settings.booking.slotHint')"
              :unit="t('settings.booking.minutes')"
              v-bind="RULE_LIMITS.slotMinutes"
              :decrease-label="
                t('settings.stepper.decrease', { label: t('settings.booking.slot') })
              "
              :increase-label="
                t('settings.stepper.increase', { label: t('settings.booking.slot') })
              "
              :error="message('rules.booking.slotMinutes')"
            />
            <div>
              <h3 class="settings-page__subheading">{{ t('settings.booking.hours') }}</h3>
              <p class="settings-page__hint">{{ t('settings.booking.hoursHint') }}</p>
              <OpeningHoursEditor v-model="rules.booking.openingHours" :errors="errors" />
            </div>
          </template>
        </section>

        <section class="settings-page__section" aria-labelledby="settings-bank">
          <h2 id="settings-bank" class="settings-page__heading">{{ t('settings.bank.title') }}</h2>
          <p class="settings-page__hint">{{ t('settings.bank.lead') }}</p>
          <p v-if="changedAt" class="settings-page__changed">{{ changedAt }}</p>
          <BankAccountSection v-model="bank" :banks="saved.banks" :errors="errors" />
        </section>

        <div class="settings-page__bar">
          <FormAlert v-if="formError" :message="t(formError)" />
          <div class="settings-page__bar-row">
            <p class="settings-page__status" aria-live="polite">
              {{ dirty ? t('settings.unsaved') : t('settings.noChanges') }}
            </p>
            <BaseButton type="submit" size="lg" :loading="busy" :disabled="!dirty">
              {{ t('settings.save') }}
            </BaseButton>
          </div>
        </div>
      </form>
    </div>

    <ConfirmSheet
      :open="confirmBank"
      :title="newBank ? t('settings.bank.confirmTitle') : t('settings.bank.confirmRemoveTitle')"
      :confirm-label="newBank ? t('settings.bank.confirm') : t('settings.bank.confirmRemove')"
      :cancel-label="t('settings.bank.cancel')"
      :variant="newBank ? 'primary' : 'danger'"
      :busy="busy"
      @confirm="confirmBankChange"
      @cancel="closeBankSheet"
    >
      <template v-if="newBank">
        <p class="settings-page__confirm-text">{{ t('settings.bank.confirmBody') }}</p>
        <p class="settings-page__confirm-account">
          <strong>{{ bankName }}</strong
          ><br />{{ newBank.accountNumber }}<br />{{ newBank.accountName }}
        </p>
      </template>
      <p v-else class="settings-page__confirm-text">{{ t('settings.bank.confirmRemoveBody') }}</p>
      <FormField
        ref="passwordField"
        v-model="currentPassword"
        class="settings-page__password"
        type="password"
        autocomplete="current-password"
        required
        :label="t('settings.bank.password')"
        :hint="t('settings.bank.passwordHint')"
        :error="passwordError && t(passwordError)"
        @keydown.enter.prevent="confirmBankChange"
      />
    </ConfirmSheet>

    <ConfirmSheet
      :open="confirmLeave"
      :title="t('settings.leave.title')"
      :confirm-label="t('settings.leave.leave')"
      :cancel-label="t('settings.leave.stay')"
      variant="danger"
      @confirm="answerLeave(true)"
      @cancel="answerLeave(false)"
    >
      <p class="settings-page__confirm-text">{{ t('settings.leave.body') }}</p>
    </ConfirmSheet>
  </OwnerShell>
</template>

<style scoped>
.settings-page {
  max-inline-size: 40rem;
}

.settings-page__title {
  margin: 0;
  font-size: var(--font-size-title);
}

.settings-page__lead {
  margin-block: var(--space-2) var(--space-4);
  color: var(--color-text-muted);
}

.settings-page__form {
  display: grid;
  gap: var(--space-4);
}

.settings-page__section {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  background: var(--color-surface);
}

.settings-page__heading {
  margin: 0;
  font-size: var(--font-size-lead);
}

.settings-page__subheading {
  margin: 0;
  font-size: var(--font-size-body);
}

.settings-page__hint {
  margin: var(--space-1) 0 0;
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
}

.settings-page__section > .settings-page__hint {
  margin-block-start: calc(-1 * var(--space-3));
}

.settings-page__changed {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-1);
  font-size: var(--font-size-small);
  color: var(--color-warning);
  background: var(--color-warning-bg);
}

.settings-page__pair {
  display: grid;
  gap: var(--space-4);
}

/*
 * Sticky at the bottom of the shell's scrolling content (which ends above the bottom navigation
 * on phones); the negative offset cancels the content's bottom padding so nothing shows below it.
 */
.settings-page__bar {
  position: sticky;
  inset-block-end: calc(-1 * var(--space-4));
  display: grid;
  gap: var(--space-2);
  margin-inline: calc(-1 * var(--space-3));
  padding: var(--space-3);
  border-block-start: 1px solid var(--color-border);
  background: var(--color-surface);
  box-shadow: var(--shadow-2);
}

.settings-page__bar-row {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  justify-content: space-between;
}

.settings-page__status {
  margin: 0;
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
}

.settings-page__confirm-text {
  margin: 0 0 var(--space-3);
}

.settings-page__password {
  margin-block-start: var(--space-3);
  color: var(--color-text);
}

.settings-page__confirm-account {
  margin: 0;
  padding: var(--space-3);
  border-radius: var(--radius-2);
  font-variant-numeric: tabular-nums;
  color: var(--color-text);
  background: var(--color-surface-muted);
}

@media (width >= 600px) {
  .settings-page__section {
    padding: var(--space-4);
  }

  .settings-page__pair {
    grid-template-columns: 1fr 1fr;
  }
}

@media (width >= 840px) {
  .settings-page__bar {
    inset-block-end: calc(-1 * var(--space-5));
    margin-inline: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-3) var(--radius-3) 0 0;
  }
}
</style>
