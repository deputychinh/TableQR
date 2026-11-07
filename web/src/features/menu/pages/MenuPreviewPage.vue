<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowLeft } from 'lucide-vue-next';
import OwnerShell from '@/app/layouts/OwnerShell.vue';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import LoadingState from '@/components/LoadingState.vue';
import { useSessionStore } from '@/stores/session';
import { menuApi } from '../api';
import GuestMenuList from '../components/GuestMenuList.vue';
import type { GuestMenu } from '../types';

const { t } = useI18n();
const session = useSessionStore();
const menu = ref<GuestMenu | null>(null);
const status = ref<'loading' | 'error' | 'ready'>('loading');

/** Reads the public guest endpoint, so the owner sees exactly what a guest will see. */
const load = async () => {
  const slug = session.me?.restaurant?.slug;
  status.value = 'loading';
  try {
    if (!slug) throw new Error('no restaurant in session');
    menu.value = await menuApi.guestMenu(slug);
    status.value = 'ready';
  } catch {
    // ErrorState offers "Thử lại".
    status.value = 'error';
  }
};

onMounted(load);
</script>

<template>
  <OwnerShell>
    <div class="menu-preview-page">
      <RouterLink to="/quan-ly/thuc-don" class="menu-preview-page__back">
        <ArrowLeft :size="20" aria-hidden="true" />
        {{ t('menu.guest.back') }}
      </RouterLink>
      <h1 class="menu-preview-page__title">{{ t('menu.guest.title') }}</h1>
      <p class="menu-preview-page__lead">{{ t('menu.guest.lead') }}</p>
      <div class="menu-preview-page__phone">
        <LoadingState v-if="status === 'loading'" :label="t('menu.loading')" />
        <ErrorState
          v-else-if="status === 'error'"
          :message="t('menu.loadFailed')"
          :retry-label="t('menu.retry')"
          @retry="load"
        />
        <template v-else-if="menu">
          <p class="menu-preview-page__restaurant">{{ menu.restaurant.name }}</p>
          <EmptyState v-if="menu.categories.length === 0" :title="t('menu.guest.empty')" />
          <GuestMenuList v-else :categories="menu.categories" />
        </template>
      </div>
    </div>
  </OwnerShell>
</template>

<style scoped>
.menu-preview-page {
  display: grid;
  gap: var(--space-2);
}

.menu-preview-page__back {
  display: inline-flex;
  gap: var(--space-1);
  align-items: center;
  justify-self: start;
  min-block-size: var(--target-min);
  font-weight: var(--font-weight-medium);
}

.menu-preview-page__title {
  margin: 0;
  font-size: var(--font-size-title);
}

.menu-preview-page__lead {
  margin: 0 0 var(--space-3);
  color: var(--color-text-muted);
}

.menu-preview-page__phone {
  display: grid;
  gap: var(--space-3);
  inline-size: 100%;
  max-inline-size: 28rem;
}

@media (width >= 840px) {
  .menu-preview-page__phone {
    padding: var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-3);
    background: var(--color-bg);
    box-shadow: var(--shadow-2);
  }
}

.menu-preview-page__restaurant {
  margin: 0;
  font-size: var(--font-size-lead);
  font-weight: var(--font-weight-bold);
}
</style>
