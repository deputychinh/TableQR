<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import HealthStatus from '@/features/health/components/HealthStatus.vue';

const { t } = useI18n();
</script>

<template>
  <main class="home-page">
    <h1 class="home-page__title">{{ t('app.name') }}</h1>
    <p class="home-page__tagline">{{ t('app.tagline') }}</p>
    <HealthStatus />
  </main>
</template>

<style scoped>
.home-page {
  max-width: 40rem;
  margin: 0 auto;
  padding: var(--space-5) var(--space-3);
}

.home-page__title {
  margin: 0;
  font-size: var(--font-size-title);
}

.home-page__tagline {
  margin: var(--space-1) 0 var(--space-4);
  color: var(--color-text-muted);
}
</style>
