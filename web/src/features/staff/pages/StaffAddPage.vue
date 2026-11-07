<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { ArrowLeft } from 'lucide-vue-next';
import OwnerShell from '@/app/layouts/OwnerShell.vue';
import BaseButton from '@/components/BaseButton.vue';
import FormAlert from '@/components/FormAlert.vue';
import FormField from '@/components/FormField.vue';
import { describeAuthError, type FieldErrors } from '@/features/auth/errors';
import RadioCardGroup from '@/components/RadioCardGroup.vue';
import {
  NEW_STAFF_ROLES,
  createStaff,
  nameOf,
  type NewStaffRole,
  type RestaurantRole,
} from '@/features/staff/services/staff.service';

type FieldName = 'displayName' | 'email' | 'password' | 'role';

const { t } = useI18n();
const router = useRouter();
const form = reactive<{
  displayName: string;
  email: string;
  password: string;
  role: RestaurantRole | '';
}>({
  displayName: '',
  email: '',
  password: '',
  role: '',
});
const fieldErrors = ref<FieldErrors>({});
const formError = ref<string>();
const busy = ref(false);
const nameField = ref<InstanceType<typeof FormField> | null>(null);
const emailField = ref<InstanceType<typeof FormField> | null>(null);
const passwordField = ref<InstanceType<typeof FormField> | null>(null);

const FIELD_KEYS: Record<FieldName, string> = {
  displayName: 'staff.errors.displayName',
  email: 'staff.errors.email',
  password: 'staff.errors.password',
  role: 'staff.errors.role',
};

const errorFor = (name: FieldName): string | undefined => {
  const key = fieldErrors.value[name];
  if (name === 'email' && key === 'auth.errors.emailTaken') return t('staff.errors.emailTaken');
  return key ? t(key) : undefined;
};

const focusFirstInvalid = (errors: FieldErrors) => {
  const order: [FieldName, typeof nameField][] = [
    ['displayName', nameField],
    ['email', emailField],
    ['password', passwordField],
  ];
  order.find(([name]) => errors[name])?.[1].value?.focus();
};

const roleOptions = computed(() =>
  NEW_STAFF_ROLES.map((role) => ({
    value: role as RestaurantRole | '',
    title: t(`roles.names.${role}`),
    body: t(`staff.roleHints.${role}`),
  })),
);

const isNewRole = (role: RestaurantRole | ''): role is NewStaffRole =>
  (NEW_STAFF_ROLES as readonly string[]).includes(role);

const submit = async () => {
  fieldErrors.value = {};
  formError.value = undefined;
  if (!isNewRole(form.role)) {
    fieldErrors.value = { role: FIELD_KEYS.role };
    return;
  }
  busy.value = true;
  try {
    const member = await createStaff({ ...form, role: form.role });
    await router.push({ path: '/quan-ly/nhan-vien', state: { added: nameOf(member) } });
  } catch (error: unknown) {
    const described = describeAuthError(error, FIELD_KEYS);
    fieldErrors.value = described.fields;
    formError.value = described.form;
    await nextTick();
    focusFirstInvalid(described.fields);
  } finally {
    busy.value = false;
  }
};
</script>

<template>
  <OwnerShell>
    <RouterLink to="/quan-ly/nhan-vien" class="staff-add__back">
      <ArrowLeft :size="20" aria-hidden="true" />
      {{ t('staff.back') }}
    </RouterLink>
    <h1 class="staff-add__title">{{ t('staff.form.title') }}</h1>
    <p class="staff-add__lead">{{ t('staff.form.lead') }}</p>
    <form class="staff-add__form" novalidate @submit.prevent="submit">
      <FormAlert v-if="formError" :message="t(formError)" />
      <FormField
        ref="nameField"
        v-model="form.displayName"
        :label="t('staff.form.displayName')"
        :hint="t('staff.form.displayNameHint')"
        autocomplete="off"
        required
        :error="errorFor('displayName')"
      />
      <FormField
        ref="emailField"
        v-model="form.email"
        type="email"
        :label="t('staff.form.email')"
        autocomplete="off"
        required
        :error="errorFor('email')"
      />
      <FormField
        ref="passwordField"
        v-model="form.password"
        type="password"
        :label="t('staff.form.password')"
        :hint="t('staff.form.passwordHint')"
        autocomplete="new-password"
        required
        :error="errorFor('password')"
      />
      <div class="staff-add__role">
        <RadioCardGroup v-model="form.role" :legend="t('staff.form.role')" :options="roleOptions" />
        <p v-if="errorFor('role')" class="staff-add__error" role="alert">{{ errorFor('role') }}</p>
      </div>
      <BaseButton type="submit" size="lg" block :loading="busy">{{
        t('staff.form.submit')
      }}</BaseButton>
    </form>
  </OwnerShell>
</template>

<style scoped>
.staff-add__back {
  display: inline-flex;
  gap: var(--space-1);
  align-items: center;
  min-block-size: var(--target-min);
  color: var(--color-primary);
  text-decoration: none;
}

.staff-add__title {
  margin: var(--space-2) 0 0;
  font-size: var(--font-size-title);
}

.staff-add__lead {
  margin-block: var(--space-2) var(--space-4);
  color: var(--color-text-muted);
}

.staff-add__form {
  display: grid;
  gap: var(--space-4);
  max-inline-size: 40rem;
}

.staff-add__role {
  display: grid;
  gap: var(--space-1);
}

.staff-add__error {
  margin: 0;
  font-size: var(--font-size-small);
  color: var(--color-danger);
}
</style>
