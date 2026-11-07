<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { LayoutDashboard, LogOut, QrCode, Settings, Users, UtensilsCrossed } from 'lucide-vue-next';
import BrandMark from '@/components/BrandMark.vue';
import { useSessionStore } from '@/stores/session';

const { t } = useI18n();
const session = useSessionStore();
const router = useRouter();

const nav = [
  { to: '/quan-ly', label: 'nav.overview', icon: LayoutDashboard, exact: true },
  { to: '/quan-ly/thuc-don', label: 'nav.menu', icon: UtensilsCrossed, exact: false },
  { to: '/quan-ly/ban', label: 'nav.tables', icon: QrCode, exact: false },
  { to: '/quan-ly/nhan-vien', label: 'nav.staff', icon: Users, exact: false },
  { to: '/quan-ly/cai-dat', label: 'nav.settings', icon: Settings, exact: false },
] as const;

const signOut = async () => {
  await session.signOut();
  await router.push('/dang-nhap');
};
</script>

<template>
  <div class="owner-shell">
    <header class="owner-shell__header">
      <BrandMark />
      <span class="owner-shell__restaurant">{{ session.me?.restaurant?.name }}</span>
      <button type="button" class="owner-shell__signout" @click="signOut">
        <LogOut :size="20" aria-hidden="true" />
        <span class="owner-shell__signout-label">{{ t('nav.signOut') }}</span>
      </button>
    </header>
    <nav class="owner-shell__nav" :aria-label="t('nav.label')">
      <RouterLink
        v-for="item in nav"
        :key="item.to"
        :to="item.to"
        class="owner-shell__link"
        :exact-active-class="item.exact ? 'owner-shell__link--active' : ''"
        :active-class="item.exact ? '' : 'owner-shell__link--active'"
      >
        <component :is="item.icon" :size="22" aria-hidden="true" />
        <span class="owner-shell__link-label">{{ t(item.label) }}</span>
      </RouterLink>
    </nav>
    <main class="owner-shell__main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.owner-shell {
  display: grid;
  grid-template:
    'header' auto
    'main' 1fr
    'nav' auto / 1fr;
  block-size: 100dvh;
  background: var(--color-bg);
}

.owner-shell__header {
  position: sticky;
  inset-block-start: 0;
  z-index: var(--z-header);
  display: flex;
  grid-area: header;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-2) var(--space-3);
  border-block-end: 1px solid var(--color-border);
  background: var(--color-surface);
}

.owner-shell__restaurant {
  overflow: hidden;
  flex: 1;
  color: var(--color-text-muted);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.owner-shell__signout {
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

.owner-shell__nav {
  position: sticky;
  inset-block-end: 0;
  display: grid;
  grid-area: nav;
  grid-template-columns: repeat(5, 1fr);
  border-block-start: 1px solid var(--color-border);
  background: var(--color-surface);
}

.owner-shell__link {
  display: grid;
  gap: var(--space-1);
  place-items: center;
  min-block-size: var(--target-large);
  padding: var(--space-1);
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
  text-decoration: none;
}

.owner-shell__link--active {
  font-weight: var(--font-weight-bold);
  color: var(--color-primary);
}

.owner-shell__main {
  /* Content scrolls between the bars, so they never cover a control (WCAG 2.4.11, 2.5.8). */
  overflow-y: auto;
  grid-area: main;
  padding: var(--space-4) max(var(--space-3), (100% - var(--measure-page)) / 2);
}

@media (width >= 840px) {
  .owner-shell {
    grid-template:
      'header header' auto
      'nav main' 1fr / 6rem 1fr;
  }

  .owner-shell__nav {
    inset-block: 4rem auto;
    grid-template-columns: 1fr;
    align-content: start;
    gap: var(--space-2);
    padding-block: var(--space-3);
    border-block-start: 0;
    border-inline-end: 1px solid var(--color-border);
  }

  .owner-shell__main {
    padding: var(--space-5) max(var(--space-5), (100% - var(--measure-page)) / 2);
  }
}

@media (width < 400px) {
  /* Icon-only on small phones; the label stays for screen readers. */
  .owner-shell__signout-label {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}
</style>
