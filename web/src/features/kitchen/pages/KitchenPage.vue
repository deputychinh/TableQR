<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Store } from 'lucide-vue-next';
import StaffShell from '@/app/layouts/StaffShell.vue';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import LoadingState from '@/components/LoadingState.vue';
import StationQueue from '../components/StationQueue.vue';
import { listStations, type KitchenStation } from '../services/kitchen.service';

/** Kitchen screen `/bep` (S9): station tabs on top, the chosen station's live queue below. */
const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const stations = ref<KitchenStation[]>([]);
const state = ref<'loading' | 'ready' | 'error'>('loading');

const load = async () => {
  state.value = 'loading';
  try {
    stations.value = await listStations();
    state.value = 'ready';
  } catch {
    state.value = 'error';
  }
};
onMounted(load);

/** The selected station lives in the URL (`?khu=<id>`), so a reload keeps the cook's tab. */
const selected = computed(
  () => stations.value.find((s) => s.id === route.query.khu) ?? stations.value[0],
);

const tabs = ref<HTMLButtonElement[]>([]);
const select = async (station: KitchenStation, focus = false) => {
  await router.replace({ query: { ...route.query, khu: station.id } });
  if (focus) {
    await nextTick();
    tabs.value[stations.value.indexOf(station)]?.focus();
  }
};

/** Arrow keys move between tabs (WAI-ARIA tabs pattern). */
const onTabKey = (event: KeyboardEvent, index: number) => {
  const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
  if (step === 0 || stations.value.length === 0) return;
  event.preventDefault();
  const next = stations.value[(index + step + stations.value.length) % stations.value.length];
  if (next) void select(next, true);
};
</script>

<template>
  <StaffShell :title="t('kitchen.title')">
    <h1 class="visually-hidden">{{ t('kitchen.title') }}</h1>
    <LoadingState v-if="state === 'loading'" :label="t('kitchen.loading')" :rows="2" />
    <ErrorState
      v-else-if="state === 'error'"
      :message="t('kitchen.loadFailed')"
      :retry-label="t('kitchen.retry')"
      @retry="load"
    />
    <EmptyState
      v-else-if="!selected"
      :title="t('kitchen.noStations.title')"
      :body="t('kitchen.noStations.body')"
    >
      <template #icon><Store :size="32" /></template>
    </EmptyState>
    <div v-else class="kitchen-page">
      <div class="kitchen-page__tabs" role="tablist" :aria-label="t('kitchen.stations')">
        <button
          v-for="(station, index) in stations"
          :id="`station-tab-${station.id}`"
          :key="station.id"
          ref="tabs"
          type="button"
          role="tab"
          class="kitchen-page__tab"
          :class="{ 'kitchen-page__tab--active': station.id === selected.id }"
          :aria-selected="station.id === selected.id"
          :aria-controls="`station-panel-${station.id}`"
          :tabindex="station.id === selected.id ? 0 : -1"
          @click="select(station)"
          @keydown="onTabKey($event, index)"
        >
          {{ station.name }}
        </button>
      </div>
      <div
        :id="`station-panel-${selected.id}`"
        role="tabpanel"
        class="kitchen-page__panel"
        :aria-labelledby="`station-tab-${selected.id}`"
      >
        <StationQueue :key="selected.id" :station-id="selected.id" />
      </div>
    </div>
  </StaffShell>
</template>

<style scoped>
.kitchen-page {
  display: grid;
  gap: var(--space-3);
}

.kitchen-page__tabs {
  display: flex;
  gap: var(--space-2);
  overflow-x: auto;
  padding-block-end: var(--space-1);
}

.kitchen-page__tab {
  flex: none;
  min-block-size: var(--target-large);
  padding-inline: var(--space-4);
  border: 2px solid var(--color-border-strong);
  border-radius: 999px;
  font: inherit;
  font-size: var(--font-size-kitchen);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
  background: var(--color-surface);
  cursor: pointer;
}

.kitchen-page__tab--active {
  border-color: var(--color-primary);
  color: var(--color-on-primary);
  background: var(--color-primary);
}

.kitchen-page__tab:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}
</style>
