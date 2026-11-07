<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ChefHat, QrCode, Wallet } from 'lucide-vue-next';
import BrandMark from '@/components/BrandMark.vue';

const { t } = useI18n();
</script>

<template>
  <div class="landing-page">
    <header class="landing-page__header">
      <BrandMark />
      <RouterLink to="/dang-nhap" class="landing-page__signin">{{
        t('landing.signIn')
      }}</RouterLink>
    </header>
    <main class="landing-page__main">
      <h1 class="landing-page__title">{{ t('landing.title') }}</h1>
      <p class="landing-page__lead">{{ t('landing.lead') }}</p>
      <RouterLink to="/dang-ky" class="landing-page__cta">{{ t('landing.signUp') }}</RouterLink>
      <ul class="landing-page__points">
        <li>
          <QrCode :size="28" aria-hidden="true" /><span>{{ t('owner.steps.tables.title') }}</span>
        </li>
        <li>
          <ChefHat :size="28" aria-hidden="true" /><span>{{ t('owner.steps.menu.title') }}</span>
        </li>
        <li>
          <Wallet :size="28" aria-hidden="true" /><span>{{ t('owner.steps.settings.title') }}</span>
        </li>
      </ul>
    </main>
  </div>
</template>

<style scoped>
.landing-page {
  min-block-size: 100dvh;
  background: var(--color-bg);
}

.landing-page__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
}

.landing-page__signin {
  display: inline-flex;
  align-items: center;
  min-block-size: var(--target-min);
  padding-inline: var(--space-3);
  font-weight: var(--font-weight-medium);
  color: var(--color-primary);
}

.landing-page__main {
  max-inline-size: 40rem;
  margin-inline: auto;
  padding: var(--space-5) var(--space-4);
}

.landing-page__title {
  margin: 0;
  font-size: var(--font-size-display);
  line-height: 1.2;
}

.landing-page__lead {
  margin-block: var(--space-3) var(--space-5);
  font-size: var(--font-size-lead);
  color: var(--color-text-muted);
}

.landing-page__cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-block-size: var(--target-large);
  padding-inline: var(--space-5);
  border-radius: var(--radius-2);
  font-size: var(--font-size-lead);
  font-weight: var(--font-weight-medium);
  color: var(--color-on-primary);
  text-decoration: none;
  background: var(--color-primary);
}

.landing-page__points {
  display: grid;
  gap: var(--space-3);
  margin: var(--space-6) 0 0;
  padding: 0;
  list-style: none;
}

.landing-page__points li {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-3);
  border-radius: var(--radius-2);
  color: var(--color-text);
  background: var(--color-surface);
  box-shadow: var(--shadow-1);
}
</style>
