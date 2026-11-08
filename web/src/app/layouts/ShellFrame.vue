<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Ellipsis, LogOut } from 'lucide-vue-next';
import BaseButton from '@/components/BaseButton.vue';
import BaseSheet from '@/components/BaseSheet.vue';
import BrandMark from '@/components/BrandMark.vue';
import ToastRegion from '@/components/ToastRegion.vue';
import { useSessionStore } from '@/stores/session';
import { ROLE_NAV, isActive, type NavItem } from './navigation';
import { useReachable } from './reachable';

/**
 * The one app frame behind `OwnerShell` and `StaffShell` (design-system "Shell per role"):
 * header, the role's navigation (bottom bar on phones with at most five items, rail from 840 px),
 * the scrolling content and the toast region. With a `title` the header names the screen
 * (floor staff); without one it names the restaurant (owner).
 */
const props = defineProps<{ title?: string }>();

const { t } = useI18n();
const session = useSessionStore();
const route = useRoute();
const router = useRouter();
const reachable = useReachable();
const moreOpen = ref(false);

interface Link extends NavItem {
  text: string;
  active: boolean;
}

/** Only what the signed-in role can open, read from the routes' own `meta.roles` (D5). */
const links = (items: readonly NavItem[]): Link[] =>
  items
    .filter((item) => reachable(item.to))
    .map((item) => ({ ...item, text: t(item.label), active: isActive(item, route.path) }));

const nav = computed(() => {
  const role = session.me?.user.role;
  const groups = role ? ROLE_NAV[role] : { primary: [], more: [], operations: [] };
  return {
    primary: links(groups.primary),
    more: links(groups.more),
    operations: links(groups.operations),
  };
});
const hasNav = computed(() => nav.value.primary.length > 0);
const hasMore = computed(() => nav.value.more.length + nav.value.operations.length > 0);
const moreActive = computed(() =>
  [...nav.value.more, ...nav.value.operations].some((link) => link.active),
);
const context = computed(() => session.me?.restaurant?.name ?? session.me?.user.email ?? '');

watch(
  () => route.path,
  () => {
    moreOpen.value = false;
  },
);

const signOut = async () => {
  await session.signOut();
  await router.push('/dang-nhap');
};
</script>

<template>
  <div class="app-shell" :class="{ 'app-shell--nav': hasNav }">
    <header class="app-shell__header">
      <BrandMark />
      <span class="app-shell__context">
        <span v-if="props.title" class="app-shell__title">{{ props.title }}</span>
        <span class="app-shell__who" :class="{ 'app-shell__who--sub': props.title }">
          {{ context }}
        </span>
      </span>
      <button type="button" class="app-shell__signout" @click="signOut">
        <LogOut :size="20" aria-hidden="true" />
        <span class="app-shell__signout-label">{{ t('nav.signOut') }}</span>
      </button>
    </header>

    <nav v-if="hasNav" class="app-shell__nav" :aria-label="t('nav.label')">
      <RouterLink
        v-for="link in nav.primary"
        :key="link.to"
        :to="link.to"
        class="app-shell__link"
        :class="{ 'app-shell__link--active': link.active }"
      >
        <component :is="link.icon" :size="22" aria-hidden="true" />
        <span class="app-shell__link-label">{{ link.text }}</span>
      </RouterLink>
      <template v-if="hasMore">
        <button
          type="button"
          class="app-shell__link app-shell__more"
          :class="{ 'app-shell__link--active': moreActive }"
          aria-haspopup="dialog"
          @click="moreOpen = true"
        >
          <Ellipsis :size="22" aria-hidden="true" />
          <span class="app-shell__link-label">{{ t('nav.more') }}</span>
        </button>
        <div class="app-shell__rail-extra">
          <RouterLink
            v-for="link in nav.more"
            :key="link.to"
            :to="link.to"
            class="app-shell__link"
            :class="{ 'app-shell__link--active': link.active }"
          >
            <component :is="link.icon" :size="22" aria-hidden="true" />
            <span class="app-shell__link-label">{{ link.text }}</span>
          </RouterLink>
          <template v-if="nav.operations.length > 0">
            <span class="app-shell__group">{{ t('nav.operations') }}</span>
            <RouterLink
              v-for="link in nav.operations"
              :key="link.to"
              :to="link.to"
              class="app-shell__link"
              :class="{ 'app-shell__link--active': link.active }"
            >
              <component :is="link.icon" :size="22" aria-hidden="true" />
              <span class="app-shell__link-label">{{ link.text }}</span>
            </RouterLink>
          </template>
        </div>
      </template>
    </nav>

    <main class="app-shell__main">
      <slot />
    </main>

    <BaseSheet :open="moreOpen" :title="t('nav.moreTitle')" @close="moreOpen = false">
      <section
        v-for="group in [
          { key: 'manage', items: nav.more },
          { key: 'operations', items: nav.operations },
        ].filter((g) => g.items.length > 0)"
        :key="group.key"
        class="app-shell__sheet-group"
      >
        <h3 class="app-shell__sheet-heading">{{ t(`nav.${group.key}`) }}</h3>
        <ul class="app-shell__sheet-list">
          <li v-for="link in group.items" :key="link.to">
            <RouterLink
              :to="link.to"
              class="app-shell__sheet-link"
              :class="{ 'app-shell__sheet-link--active': link.active }"
            >
              <component :is="link.icon" :size="22" aria-hidden="true" />
              {{ link.text }}
            </RouterLink>
          </li>
        </ul>
      </section>
      <template #actions>
        <BaseButton variant="secondary" @click="moreOpen = false">{{ t('nav.close') }}</BaseButton>
      </template>
    </BaseSheet>
    <ToastRegion />
  </div>
</template>

<style scoped>
.app-shell {
  display: grid;
  grid-template:
    'header' auto
    'main' 1fr / minmax(0, 1fr);
  block-size: 100dvh;
  background: var(--color-bg);
}

.app-shell--nav {
  grid-template:
    'header' auto
    'main' 1fr
    'nav' auto / minmax(0, 1fr);
}

.app-shell__header {
  z-index: var(--z-header);
  display: flex;
  grid-area: header;
  gap: var(--space-3);
  align-items: center;
  min-inline-size: 0;
  padding: var(--space-2) var(--space-3);
  border-block-end: 1px solid var(--color-border);
  background: var(--color-surface);
}

.app-shell__context {
  display: grid;
  flex: 1;
  min-inline-size: 0;
}

.app-shell__title {
  overflow: hidden;
  font-weight: var(--font-weight-bold);
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* A long restaurant name ends in "…" instead of widening the page (r2 review, 390 px). */
.app-shell__who {
  overflow: hidden;
  color: var(--color-text-muted);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.app-shell__who--sub {
  font-size: var(--font-size-small);
}

.app-shell__signout {
  display: inline-flex;
  flex: none;
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

.app-shell__nav {
  z-index: var(--z-header);
  display: grid;
  grid-area: nav;
  grid-auto-columns: minmax(0, 1fr);
  grid-auto-flow: column;
  padding-block-end: env(safe-area-inset-bottom);
  border-block-start: 1px solid var(--color-border);
  background: var(--color-surface);
}

.app-shell__link {
  display: grid;
  gap: var(--space-1);
  place-items: center;
  min-inline-size: 0;
  min-block-size: var(--target-large);
  padding: var(--space-1) 0;
  border: 0;
  font: inherit;
  font-size: var(--font-size-small);
  text-align: center;
  color: var(--color-text-muted);
  text-decoration: none;
  background: transparent;
  cursor: pointer;
}

.app-shell__link-label {
  max-inline-size: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.app-shell__link--active {
  font-weight: var(--font-weight-bold);
  color: var(--color-primary);
}

/* Phones: the extra destinations live in the "Thêm" sheet, not in the bar. */
.app-shell__rail-extra {
  display: none;
}

.app-shell__group {
  padding: var(--space-2) var(--space-1) 0;
  border-block-start: 1px solid var(--color-border);
  font-size: var(--font-size-small);
  font-weight: var(--font-weight-bold);
  text-align: center;
  color: var(--color-text-muted);
}

.app-shell__main {
  /* Content scrolls between the bars, so they never cover a control (WCAG 2.4.11, 2.5.8). */
  overflow-y: auto;
  grid-area: main;
  min-inline-size: 0;
  padding: var(--space-4) max(var(--space-3), (100% - var(--measure-page)) / 2);
}

.app-shell__sheet-group {
  display: grid;
  gap: var(--space-2);
}

.app-shell__sheet-heading {
  margin: 0;
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
}

.app-shell__sheet-list {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.app-shell__sheet-link {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  min-block-size: var(--target-min);
  padding-inline: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
  text-decoration: none;
}

.app-shell__sheet-link--active {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

@media (width >= 840px) {
  .app-shell--nav {
    grid-template:
      'header header' auto
      'nav main' 1fr / 6rem minmax(0, 1fr);
  }

  .app-shell__nav {
    overflow-y: auto;
    grid-auto-flow: row;
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
    gap: var(--space-2);
    padding-block: var(--space-3);
    border-block-start: 0;
    border-inline-end: 1px solid var(--color-border);
  }

  .app-shell__more {
    display: none;
  }

  .app-shell__rail-extra {
    display: contents;
  }

  .app-shell__main {
    padding: var(--space-5) max(var(--space-5), (100% - var(--measure-page)) / 2);
  }
}

@media (width < 400px) {
  /* Icon-only on small phones; the label stays for screen readers. */
  .app-shell__signout-label {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}
</style>
