<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import AuthLayout from '@/app/layouts/AuthLayout.vue';

const { t } = useI18n();
</script>

<template>
  <AuthLayout>
    <h1 class="not-found-page__title">{{ t('errors.notFound') }}</h1>
    <RouterLink to="/">{{ t('errors.backHome') }}</RouterLink>
  </AuthLayout>
</template>

<style scoped>
.not-found-page__title {
  margin-block: 0 var(--space-3);
  font-size: var(--font-size-title);
}
</style>
