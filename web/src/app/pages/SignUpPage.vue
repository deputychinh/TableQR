<script setup lang="ts">
import { nextTick, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import AuthLayout from '@/app/layouts/AuthLayout.vue';
import BaseButton from '@/components/BaseButton.vue';
import FormAlert from '@/components/FormAlert.vue';
import FormField from '@/components/FormField.vue';
import { describeAuthError, type FieldErrors } from '@/features/auth/errors';
import { useSessionStore } from '@/stores/session';

type FieldName = 'restaurantName' | 'email' | 'password';

const { t } = useI18n();
const router = useRouter();
const session = useSessionStore();
const form = reactive({ restaurantName: '', email: '', password: '' });
const fieldErrors = ref<FieldErrors>({});
const formError = ref<string>();
const busy = ref(false);
const nameField = ref<InstanceType<typeof FormField> | null>(null);
const emailField = ref<InstanceType<typeof FormField> | null>(null);
const passwordField = ref<InstanceType<typeof FormField> | null>(null);

const FIELD_KEYS: Record<FieldName, string> = {
  restaurantName: 'auth.errors.restaurantName',
  email: 'auth.errors.email',
  password: 'auth.errors.password',
};

const focusFirstInvalid = (errors: FieldErrors) => {
  const order: [FieldName, typeof nameField][] = [
    ['restaurantName', nameField],
    ['email', emailField],
    ['password', passwordField],
  ];
  order.find(([name]) => errors[name])?.[1].value?.focus();
};

const errorFor = (name: FieldName): string | undefined => {
  const key = fieldErrors.value[name];
  return key ? t(key) : undefined;
};

const submit = async () => {
  busy.value = true;
  fieldErrors.value = {};
  formError.value = undefined;
  try {
    await session.signUp({ ...form });
    await router.push('/quan-ly');
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
  <AuthLayout>
    <h1 class="sign-up-page__title">{{ t('auth.signUpTitle') }}</h1>
    <p class="sign-up-page__lead">{{ t('auth.signUpLead') }}</p>
    <form class="sign-up-page__form" novalidate @submit.prevent="submit">
      <FormAlert v-if="formError" :message="t(formError)" />
      <FormField
        ref="nameField"
        v-model="form.restaurantName"
        :label="t('auth.restaurantName')"
        :hint="t('auth.restaurantNameHint')"
        autocomplete="organization"
        required
        :error="errorFor('restaurantName')"
      />
      <FormField
        ref="emailField"
        v-model="form.email"
        type="email"
        :label="t('auth.email')"
        autocomplete="email"
        required
        :error="errorFor('email')"
      />
      <FormField
        ref="passwordField"
        v-model="form.password"
        type="password"
        :label="t('auth.password')"
        :hint="t('auth.passwordHint')"
        autocomplete="new-password"
        required
        :error="errorFor('password')"
      />
      <BaseButton type="submit" size="lg" block :loading="busy">{{
        t('auth.submitSignUp')
      }}</BaseButton>
    </form>
    <p class="sign-up-page__switch">
      {{ t('auth.haveAccount') }} <RouterLink to="/dang-nhap">{{ t('auth.goSignIn') }}</RouterLink>
    </p>
  </AuthLayout>
</template>

<style scoped>
.sign-up-page__title {
  margin: 0;
  font-size: var(--font-size-title);
}

.sign-up-page__lead {
  margin-block: var(--space-2) var(--space-4);
  color: var(--color-text-muted);
}

.sign-up-page__form {
  display: grid;
  gap: var(--space-4);
}

.sign-up-page__switch {
  margin-block: var(--space-4) 0;
  text-align: center;
  color: var(--color-text-muted);
}
</style>
