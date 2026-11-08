<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import { CheckCheck, ClipboardCheck, CookingPot, Soup } from 'lucide-vue-next';
import { ApiError } from '@/api/client';
import StaffShell from '@/app/layouts/StaffShell.vue';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import LoadingState from '@/components/LoadingState.vue';
import StatusChip from '@/components/StatusChip.vue';
import { useToastStore } from '@/stores/toast';
import ReadyTableCard from '../components/ReadyTableCard.vue';
import { serveItem, type FloorTable, type ReadyItem } from '../services/serving.service';
import { useReadyBoard } from '../useReadyBoard';

/** Waiter screen `/phuc-vu` (S10): dishes ready to carry out, by table; tables' progress below. */
const { t } = useI18n();
const { board, loaded, failed, status, refetch, applyChange } = useReadyBoard();

const withReady = computed(() => board.value.tables.filter((x) => x.ready.length > 0));
const others = computed(() => board.value.tables.filter((x) => x.ready.length === 0));

const busyId = ref<string | undefined>();
const toast = useToastStore();

const serve = async (table: FloorTable, item: ReadyItem) => {
  busyId.value = item.id;
  try {
    const change = await serveItem(item);
    applyChange({ itemId: change.id, status: change.status, version: change.version });
    toast.show(t('serving.served', { dish: item.name, table: table.tableName }));
  } catch (error: unknown) {
    const stale = error instanceof ApiError && (error.status === 409 || error.status === 404);
    toast.show(t(stale ? 'serving.errors.changed' : 'serving.errors.failed'), 'error');
    if (stale) await refetch();
  } finally {
    busyId.value = undefined;
  }
};
</script>

<template>
  <StaffShell :title="t('serving.title')">
    <div class="serving-page">
      <div class="serving-page__top">
        <h1 class="serving-page__title">{{ t('serving.ready.title') }}</h1>
        <RouterLink class="serving-page__held" to="/phuc-vu/duyet">
          <ClipboardCheck :size="20" aria-hidden="true" />
          {{ t('serving.heldOrders') }}
        </RouterLink>
      </div>
      <!-- Live connection state only; action outcomes go to the shell's toast. -->
      <p class="serving-page__message" aria-live="polite">
        <template v-if="status === 'reconnecting'">{{ t('serving.live.reconnecting') }}</template>
      </p>
      <LoadingState v-if="!loaded && !failed" :label="t('serving.loading')" :rows="3" />
      <ErrorState
        v-else-if="failed"
        :message="t('serving.loadFailed')"
        :retry-label="t('serving.retry')"
        @retry="refetch"
      />
      <template v-else>
        <EmptyState
          v-if="withReady.length === 0"
          :title="t('serving.ready.empty.title')"
          :body="t('serving.ready.empty.body')"
        >
          <template #icon><Soup :size="32" /></template>
        </EmptyState>
        <ol v-else class="serving-page__list">
          <li v-for="table in withReady" :key="table.sessionId">
            <ReadyTableCard
              :table="table"
              :busy-id="busyId"
              @serve="(item) => serve(table, item)"
            />
          </li>
        </ol>
        <section
          v-if="others.length > 0"
          class="serving-page__tables"
          aria-labelledby="tables-title"
        >
          <h2 id="tables-title" class="serving-page__subtitle">{{ t('serving.tables.title') }}</h2>
          <ul class="serving-page__chips">
            <li v-for="table in others" :key="table.sessionId" class="serving-page__table">
              <span class="serving-page__table-name">{{ table.tableName }}</span>
              <StatusChip
                v-if="table.complete"
                :label="t('serving.tables.complete')"
                tone="success"
                :icon="CheckCheck"
              />
              <StatusChip
                v-else
                :label="t('serving.tables.remaining', { n: table.remaining })"
                :icon="CookingPot"
              />
            </li>
          </ul>
        </section>
      </template>
    </div>
  </StaffShell>
</template>

<style scoped>
.serving-page {
  display: grid;
  gap: var(--space-3);
  max-inline-size: 48rem;
  margin-inline: auto;
}

.serving-page__top {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  justify-content: space-between;
}

.serving-page__title {
  margin: 0;
  font-size: var(--font-size-title);
}

.serving-page__held {
  display: inline-flex;
  gap: var(--space-1);
  align-items: center;
  min-block-size: var(--target-min);
  padding-inline: var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-2);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
  text-decoration: none;
  background: var(--color-surface);
}

.serving-page__message {
  min-block-size: 1.5em;
  margin: 0;
  color: var(--color-text-muted);
}

.serving-page__list {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.serving-page__tables {
  display: grid;
  gap: var(--space-2);
}

.serving-page__subtitle {
  margin: 0;
  font-size: var(--font-size-lead);
}

.serving-page__chips {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.serving-page__table {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  justify-content: space-between;
  min-block-size: var(--target-min);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  background: var(--color-surface);
}

.serving-page__table-name {
  font-weight: var(--font-weight-medium);
}
</style>
