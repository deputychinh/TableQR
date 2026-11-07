<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import AuthLayout from '@/app/layouts/AuthLayout.vue';
import BaseButton from '@/components/BaseButton.vue';
import FormAlert from '@/components/FormAlert.vue';
import FormField from '@/components/FormField.vue';
import { describeAuthError } from '@/features/auth/errors';
import { useSessionStore } from '@/stores/session';
import { safeNextPath } from '@/features/auth/next-path';
import { roleHome } from '@/features/roles/role-home';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const session = useSessionStore();
const form = reactive({ email: '', password: '' });
const formError = ref<string>();
const busy = ref(false);

const submit = async () => {
  busy.value = true;
  formError.value = undefined;
  try {
    const me = await session.signIn({ ...form });
    await router.push(safeNextPath(route.query.next, roleHome(me.user.role)));
  } catch (error: unknown) {
    const described = describeAuthError(error, {});
    formError.value = described.form ?? 'auth.errors.invalidCredentials';
  } finally {
    busy.value = false;
  }
};
</script>

<template>
  <AuthLayout>
    <h1 class="sign-in-page__title">{{ t('auth.signInTitle') }}</h1>
    <p class="sign-in-page__lead">{{ t('auth.signInLead') }}</p>
    <form class="sign-in-page__form" novalidate @submit.prevent="submit">
      <FormAlert v-if="formError" :message="t(formError)" />
      <FormField
        v-model="form.email"
        type="email"
        :label="t('auth.email')"
        autocomplete="email"
        required
      />
      <FormField
        v-model="form.password"
        type="password"
        :label="t('auth.password')"
        autocomplete="current-password"
        required
      />
      <BaseButton type="submit" size="lg" block :loading="busy">{{
        t('auth.submitSignIn')
      }}</BaseButton>
    </form>
    <p class="sign-in-page__switch">
      {{ t('auth.noAccount') }} <RouterLink to="/dang-ky">{{ t('auth.goSignUp') }}</RouterLink>
    </p>
  </AuthLayout>
</template>

<style scoped>
.sign-in-page__title {
  margin: 0;
  font-size: var(--font-size-title);
}

.sign-in-page__lead {
  margin-block: var(--space-2) var(--space-4);
  color: var(--color-text-muted);
}

.sign-in-page__form {
  display: grid;
  gap: var(--space-4);
}

.sign-in-page__switch {
  margin-block: var(--space-4) 0;
  text-align: center;
  color: var(--color-text-muted);
}
</style>
