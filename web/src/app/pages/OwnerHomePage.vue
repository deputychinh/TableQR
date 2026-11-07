<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ChevronRight, QrCode, Settings, UtensilsCrossed } from 'lucide-vue-next';
import OwnerShell from '@/app/layouts/OwnerShell.vue';
import { useSessionStore } from '@/stores/session';

const { t } = useI18n();
const session = useSessionStore();

const steps = [
  { key: 'menu', to: '/quan-ly/thuc-don', icon: UtensilsCrossed },
  { key: 'tables', to: '/quan-ly/ban', icon: QrCode },
  { key: 'settings', to: '/quan-ly/cai-dat', icon: Settings },
] as const;
</script>

<template>
  <OwnerShell>
    <h1 class="owner-home__title">
      {{ t('owner.welcome', { name: session.me?.restaurant?.name ?? '' }) }}
    </h1>
    <p class="owner-home__lead">{{ t('owner.lead') }}</p>
    <ol class="owner-home__steps">
      <li v-for="(step, index) in steps" :key="step.key">
        <RouterLink :to="step.to" class="owner-home__step">
          <span class="owner-home__icon">
            <component :is="step.icon" :size="24" aria-hidden="true" />
          </span>
          <span class="owner-home__text">
            <span class="owner-home__eyebrow">{{ t('owner.step', { n: index + 1 }) }}</span>
            <span class="owner-home__step-title">{{ t(`owner.steps.${step.key}.title`) }}</span>
            <span class="owner-home__step-body">{{ t(`owner.steps.${step.key}.body`) }}</span>
          </span>
          <ChevronRight :size="22" aria-hidden="true" class="owner-home__chevron" />
        </RouterLink>
      </li>
    </ol>
  </OwnerShell>
</template>

<style scoped>
.owner-home__title {
  margin: 0;
  font-size: var(--font-size-title);
}

.owner-home__lead {
  margin-block: var(--space-2) var(--space-4);
  color: var(--color-text-muted);
}

.owner-home__steps {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

@media (width >= 840px) {
  .owner-home__steps {
    grid-template-columns: repeat(3, 1fr);
  }
}

.owner-home__step {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  block-size: 100%;
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  color: var(--color-text);
  text-decoration: none;
  background: var(--color-surface);
  box-shadow: var(--shadow-1);
}

@media (hover: hover) {
  .owner-home__step:hover {
    border-color: var(--color-primary);
  }
}

.owner-home__icon {
  display: grid;
  flex: none;
  place-items: center;
  inline-size: 3rem;
  block-size: 3rem;
  border-radius: var(--radius-2);
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.owner-home__text {
  display: grid;
  flex: 1;
  gap: var(--space-1);
}

.owner-home__eyebrow {
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
}

.owner-home__step-title {
  font-weight: var(--font-weight-bold);
}

.owner-home__step-body {
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
}

.owner-home__chevron {
  flex: none;
  color: var(--color-text-muted);
}
</style>
