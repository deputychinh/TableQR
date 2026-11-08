<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { LogOut, QrCode } from 'lucide-vue-next';
import BrandMark from '@/components/BrandMark.vue';
import { useSessionStore } from '@/stores/session';
import { useReachable } from './reachable';

/** App shell for the cashier, waiter, kitchen and platform-admin screens (one per role). */
defineProps<{ title: string }>();

const { t } = useI18n();
const session = useSessionStore();
const router = useRouter();
const reachable = useReachable();
/** Floor staff replace torn QR stickers during service (D5); shown only to roles that may. */
const TABLES_PATH = '/quan-ly/ban';

const signOut = async () => {
  await session.signOut();
  await router.push('/dang-nhap');
};
</script>

<template>
  <div class="staff-shell">
    <header class="staff-shell__header">
      <BrandMark />
      <span class="staff-shell__context">
        <span class="staff-shell__title">{{ title }}</span>
        <span class="staff-shell__who">
          {{ session.me?.restaurant?.name ?? session.me?.user.email }}
        </span>
      </span>
      <RouterLink v-if="reachable(TABLES_PATH)" :to="TABLES_PATH" class="staff-shell__link">
        <QrCode :size="20" aria-hidden="true" />
        <span class="staff-shell__link-label">{{ t('nav.tables') }}</span>
      </RouterLink>
      <button type="button" class="staff-shell__signout" @click="signOut">
        <LogOut :size="20" aria-hidden="true" />
        <span class="staff-shell__signout-label">{{ t('nav.signOut') }}</span>
      </button>
    </header>
    <main class="staff-shell__main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.staff-shell {
  display: grid;
  grid-template-rows: auto 1fr;
  min-block-size: 100dvh;
  background: var(--color-bg);
}

.staff-shell__header {
  position: sticky;
  inset-block-start: 0;
  z-index: var(--z-header);
  display: flex;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-2) var(--space-3);
  border-block-end: 1px solid var(--color-border);
  background: var(--color-surface);
}

.staff-shell__context {
  display: grid;
  flex: 1;
  min-inline-size: 0;
}

.staff-shell__title {
  font-weight: var(--font-weight-bold);
}

.staff-shell__who {
  overflow: hidden;
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.staff-shell__link {
  display: inline-flex;
  gap: var(--space-1);
  align-items: center;
  min-block-size: var(--target-min);
  padding-inline: var(--space-2);
  border-radius: var(--radius-1);
  font-weight: var(--font-weight-bold);
  color: var(--color-primary);
  text-decoration: none;
}

.staff-shell__signout {
  display: inline-flex;
  gap: var(--space-1);
  align-items: center;
  min-block-size: var(--target-min);
  padding-inline: var(--space-2);
  border: 0;
  border-radius: var(--radius-1);
  font: inherit;
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.staff-shell__main {
  inline-size: 100%;
  max-inline-size: var(--measure-page);
  margin-inline: auto;
  padding: var(--space-4) var(--space-3);
}

@media (width >= 840px) {
  .staff-shell__main {
    padding: var(--space-5);
  }
}

@media (width < 400px) {
  /* Icon-only on small phones; the label stays for screen readers. */
  .staff-shell__link-label,
  .staff-shell__signout-label {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}
</style>
