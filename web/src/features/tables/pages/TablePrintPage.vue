<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { ArrowLeft, Printer } from 'lucide-vue-next';
import BaseButton from '@/components/BaseButton.vue';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import LoadingState from '@/components/LoadingState.vue';
import { useSessionStore } from '@/stores/session';
import QrImage from '../components/QrImage.vue';
import { useTables } from '../composables/useTables';
import { guestTableUrl } from '../qr';

/** AC9: one A4-printable sheet of QR cards (all tables, or one with `?ban=<id>`). */
const { t } = useI18n();
const route = useRoute();
const session = useSessionStore();
const { items, status, load } = useTables();
const origin = window.location.origin;
const restaurantName = computed(() => session.me?.restaurant?.name ?? '');
const only = computed(() => (typeof route.query.ban === 'string' ? route.query.ban : undefined));
const cards = computed(() =>
  only.value === undefined ? items.value : items.value.filter((item) => item.id === only.value),
);

onMounted(load);

const print = () => window.print();
</script>

<template>
  <div class="table-print">
    <header class="table-print__toolbar">
      <RouterLink to="/quan-ly/ban" class="table-print__back">
        <ArrowLeft :size="20" aria-hidden="true" />
        {{ t('tables.print.back') }}
      </RouterLink>
      <div class="table-print__heading">
        <h1 class="table-print__title">{{ t('tables.print.title') }}</h1>
        <p class="table-print__lead">
          {{ only ? t('tables.print.leadOne') : t('tables.print.lead') }}
        </p>
      </div>
      <BaseButton
        v-if="status === 'ready' && cards.length > 0"
        size="lg"
        class="table-print__button"
        @click="print"
      >
        <Printer :size="20" aria-hidden="true" />
        {{ t('tables.print.button') }}
      </BaseButton>
    </header>

    <div v-if="status !== 'ready' || cards.length === 0" class="table-print__state">
      <LoadingState v-if="status === 'loading'" :label="t('tables.loading')" :rows="2" />
      <ErrorState
        v-else-if="status === 'error'"
        :message="t('tables.loadError')"
        :retry-label="t('tables.retry')"
        @retry="load"
      />
      <EmptyState
        v-else
        :title="only ? t('tables.print.notFound') : t('tables.emptyTitle')"
        :body="only ? undefined : t('tables.emptyBody')"
      />
    </div>

    <section v-else class="table-print__sheet" :aria-label="t('tables.print.sheet')">
      <article v-for="table in cards" :key="table.id" class="table-print__card">
        <p class="table-print__restaurant">{{ restaurantName }}</p>
        <QrImage
          class="table-print__qr"
          :text="guestTableUrl(origin, table.qrToken)"
          :alt="t('tables.qrAlt', { name: table.name })"
        />
        <h2 class="table-print__name">{{ table.name }}</h2>
        <p class="table-print__scan">{{ t('tables.print.scan') }}</p>
      </article>
    </section>
  </div>
</template>

<style scoped>
.table-print {
  display: grid;
  gap: var(--space-4);
  max-inline-size: var(--measure-page);
  margin-inline: auto;
  padding: var(--space-3);
}

.table-print__toolbar {
  display: grid;
  gap: var(--space-3);
}

.table-print__back {
  display: inline-flex;
  gap: var(--space-1);
  align-items: center;
  justify-self: start;
  min-block-size: var(--target-min);
}

.table-print__title {
  margin: 0;
  font-size: var(--font-size-title);
}

.table-print__lead {
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
}

/* The preview looks like the paper it prints on: white cards in both themes. */
.table-print__sheet {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  gap: var(--space-3);
}

.table-print__card {
  display: grid;
  gap: var(--space-2);
  justify-items: center;
  padding: var(--space-4) var(--space-3);
  border: 1px dashed var(--color-gray-300);
  border-radius: var(--radius-2);
  color: var(--color-gray-900);
  text-align: center;
  background: var(--color-white);
  break-inside: avoid;
}

.table-print__restaurant {
  margin: 0;
  font-weight: var(--font-weight-medium);
}

.table-print__qr {
  inline-size: min(12rem, 100%);
}

.table-print__name {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: var(--font-size-title);
}

.table-print__scan {
  margin: 0;
}

@media (width >= 840px) {
  .table-print {
    padding: var(--space-5);
  }

  .table-print__toolbar {
    grid-template-columns: 1fr auto;
    align-items: end;
  }

  .table-print__back {
    grid-column: 1 / -1;
  }
}

@page {
  size: a4 portrait;
  margin: 10mm;
}

@media print {
  .table-print {
    display: block;
    max-inline-size: none;
    padding: 0;
  }

  .table-print__toolbar,
  .table-print__state {
    display: none;
  }

  /* A4 minus 10 mm margins = 190 × 277 mm: 2 columns × 3 rows of 92 × 88 mm cards. */
  .table-print__sheet {
    grid-template-columns: repeat(2, 92mm);
    grid-auto-rows: 88mm;
    gap: 4mm 6mm;
  }

  .table-print__card {
    align-content: center;
    gap: 2mm;
    padding: 4mm;
    border-radius: 0;
  }

  .table-print__restaurant {
    font-size: 11pt;
  }

  .table-print__qr {
    inline-size: 52mm;
  }

  .table-print__name {
    font-size: 18pt;
  }

  .table-print__scan {
    font-size: 11pt;
  }
}
</style>
