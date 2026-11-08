<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { ChevronDown, EyeOff, Plus, Printer, QrCode, Users } from 'lucide-vue-next';
import { ApiError } from '@/api/client';
import RoleShell from '@/app/layouts/RoleShell.vue';
import BaseButton from '@/components/BaseButton.vue';
import ConfirmSheet from '@/components/ConfirmSheet.vue';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import FormAlert from '@/components/FormAlert.vue';
import LoadingState from '@/components/LoadingState.vue';
import StatusChip from '@/components/StatusChip.vue';
import { useSessionStore } from '@/stores/session';
import { useToastStore } from '@/stores/toast';
import type { TableInput, TableItem } from '../api';
import TableCard from '../components/TableCard.vue';
import TableFormSheet from '../components/TableFormSheet.vue';
import { useTables } from '../composables/useTables';

const { t } = useI18n();
const router = useRouter();
const session = useSessionStore();
const { items, archived, status, load, add, update, rotate, remove, archive, unarchive } =
  useTables();
const showArchived = ref(false);
const showingId = ref<string>();
const canManage = computed(() => session.me?.user.role === 'owner');
const origin = window.location.origin;
const toast = useToastStore();

const actionError = ref<string>();
const formOpen = ref(false);
const editing = ref<TableItem>();
const confirming = ref<{ kind: 'rotate' | 'delete' | 'refused'; table: TableItem }>();
const confirmBusy = ref(false);

onMounted(load);

const openAdd = () => {
  editing.value = undefined;
  formOpen.value = true;
};

const openEdit = (table: TableItem) => {
  editing.value = table;
  formOpen.value = true;
};

const save = async (input: TableInput) => {
  const current = editing.value;
  const table = current ? await update(current.id, input) : await add(input);
  formOpen.value = false;
  toast.show(t(current ? 'tables.saved' : 'tables.created', { name: table.name }));
};

const confirmAction = async () => {
  const pending = confirming.value;
  if (!pending) return;
  confirmBusy.value = true;
  actionError.value = undefined;
  try {
    if (pending.kind === 'refused') {
      // TQR-024: a table with history is hidden instead ("Ẩn bàn"); "Bàn đã ẩn" lists it.
      await archive(pending.table.id);
      toast.show(t('tables.archive.done', { name: pending.table.name }));
    } else if (pending.kind === 'rotate') {
      await rotate(pending.table.id);
      toast.show(t('tables.rotate.done', { name: pending.table.name }));
    } else {
      await remove(pending.table.id);
      toast.show(t('tables.delete.done', { name: pending.table.name }));
    }
    confirming.value = undefined;
  } catch (error: unknown) {
    confirming.value = undefined;
    if (error instanceof ApiError && error.code === 'TABLE_HAS_HISTORY') {
      // Keep the sheet and say why (TQR-007 review): the table carries paid bills and bookings.
      confirming.value = { kind: 'refused', table: pending.table };
    } else {
      await showError(error);
    }
  } finally {
    confirmBusy.value = false;
  }
};

/** One message for a failed table action, under the page title. */
const showError = async (error: unknown) => {
  if (error instanceof ApiError && error.code === 'TABLE_IN_USE') {
    actionError.value = t('tables.archive.inUse');
  } else if (error instanceof ApiError && error.code === 'NOT_FOUND') {
    actionError.value = t('tables.errors.gone');
    await load();
  } else {
    actionError.value = t(
      error instanceof ApiError && error.code === 'NETWORK'
        ? 'errors.network'
        : 'errors.unexpected',
    );
  }
};

/** "Hiện lại": reversible, so no confirmation; the table is back in the list and printable. */
const showAgain = async (table: TableItem) => {
  showingId.value = table.id;
  actionError.value = undefined;
  try {
    await unarchive(table.id);
    toast.show(t('tables.archived.shown', { name: table.name }));
  } catch (error: unknown) {
    await showError(error);
  } finally {
    showingId.value = undefined;
  }
};

const printOne = (table: TableItem) =>
  router.push({ path: '/quan-ly/ban/in', query: { ban: table.id } });
const printAll = () => router.push('/quan-ly/ban/in');
</script>

<template>
  <RoleShell :title="t('tables.title')">
    <div class="tables-page">
      <header class="tables-page__header">
        <div class="tables-page__heading">
          <h1 class="tables-page__title">{{ t('tables.title') }}</h1>
          <p class="tables-page__lead">{{ t('tables.lead') }}</p>
        </div>
        <div v-if="status === 'ready' && items.length > 0" class="tables-page__toolbar">
          <BaseButton variant="secondary" @click="printAll">
            <Printer :size="20" aria-hidden="true" />
            {{ t('tables.printAll') }}
          </BaseButton>
          <BaseButton v-if="canManage" @click="openAdd">
            <Plus :size="20" aria-hidden="true" />
            {{ t('tables.add') }}
          </BaseButton>
        </div>
      </header>

      <FormAlert v-if="actionError" :message="actionError" />
      <p v-if="!canManage && status === 'ready'" class="tables-page__readonly">
        {{ t('tables.readOnly') }}
      </p>

      <LoadingState v-if="status === 'loading'" :label="t('tables.loading')" />
      <ErrorState
        v-else-if="status === 'error'"
        :message="t('tables.loadError')"
        :retry-label="t('tables.retry')"
        @retry="load"
      />
      <EmptyState
        v-else-if="items.length === 0"
        :title="t('tables.emptyTitle')"
        :body="canManage ? t('tables.emptyBody') : t('tables.emptyReadOnly')"
      >
        <template #icon><QrCode :size="32" /></template>
        <template v-if="canManage" #action>
          <BaseButton size="lg" @click="openAdd">
            <Plus :size="20" aria-hidden="true" />
            {{ t('tables.addFirst') }}
          </BaseButton>
        </template>
      </EmptyState>
      <template v-else>
        <p class="tables-page__count">{{ t('tables.count', { n: items.length }) }}</p>
        <ul class="tables-page__list">
          <li v-for="table in items" :key="table.id">
            <TableCard
              :table="table"
              :can-manage="canManage"
              :origin="origin"
              @print="printOne(table)"
              @edit="openEdit(table)"
              @rotate="confirming = { kind: 'rotate', table }"
              @remove="confirming = { kind: 'delete', table }"
            />
          </li>
        </ul>
      </template>

      <section
        v-if="canManage && status === 'ready' && archived.length > 0"
        class="tables-page__archived"
        aria-labelledby="tables-archived-toggle"
      >
        <h2 class="tables-page__archived-heading">
          <button
            id="tables-archived-toggle"
            type="button"
            class="tables-page__archived-toggle"
            :aria-expanded="showArchived"
            aria-controls="tables-archived-list"
            @click="showArchived = !showArchived"
          >
            <EyeOff :size="20" aria-hidden="true" />
            <span>{{ t('tables.archived.toggle', { n: archived.length }) }}</span>
            <ChevronDown
              :size="20"
              aria-hidden="true"
              class="tables-page__archived-chevron"
              :class="{ 'tables-page__archived-chevron--open': showArchived }"
            />
          </button>
        </h2>
        <div v-show="showArchived" id="tables-archived-list" class="tables-page__archived-body">
          <p class="tables-page__archived-lead">{{ t('tables.archived.lead') }}</p>
          <ul class="tables-page__archived-list">
            <li v-for="table in archived" :key="table.id" class="tables-page__archived-item">
              <div class="tables-page__archived-info">
                <span class="tables-page__archived-name">{{ table.name }}</span>
                <span class="tables-page__archived-meta">
                  <Users :size="16" aria-hidden="true" />
                  {{ t('tables.seats', { n: table.seats }) }}
                </span>
                <StatusChip :label="t('tables.archived.badge')" :icon="EyeOff" />
              </div>
              <BaseButton
                variant="secondary"
                class="tables-page__archived-show"
                :loading="showingId === table.id"
                :aria-label="t('tables.archived.showFor', { name: table.name })"
                @click="showAgain(table)"
              >
                {{ t('tables.archived.show') }}
              </BaseButton>
            </li>
          </ul>
        </div>
      </section>
    </div>

    <TableFormSheet :open="formOpen" :table="editing" :save="save" @close="formOpen = false" />
    <ConfirmSheet
      :open="confirming !== undefined"
      :title="
        confirming ? t(`tables.${confirming.kind}.title`, { name: confirming.table.name }) : ''
      "
      :confirm-label="confirming ? t(`tables.${confirming.kind}.confirm`) : ''"
      :cancel-label="
        confirming?.kind === 'refused' ? t('tables.refused.close') : t('tables.form.cancel')
      "
      :busy="confirmBusy"
      :variant="confirming?.kind === 'delete' ? 'danger' : 'primary'"
      @confirm="confirmAction"
      @cancel="confirming = undefined"
    >
      <p v-if="confirming">{{ t(`tables.${confirming.kind}.body`) }}</p>
    </ConfirmSheet>
  </RoleShell>
</template>

<style scoped>
.tables-page {
  display: grid;
  gap: var(--space-3);
}

.tables-page__header {
  display: grid;
  gap: var(--space-3);
}

.tables-page__title {
  margin: 0;
  font-size: var(--font-size-title);
}

.tables-page__lead {
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
}

.tables-page__toolbar {
  display: flex;
  flex-direction: column-reverse;
  gap: var(--space-2);
}

.tables-page__readonly,
.tables-page__count {
  margin: 0;
  color: var(--color-text-muted);
}

.tables-page__list {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.tables-page__archived {
  display: grid;
  gap: var(--space-2);
  padding-block-start: var(--space-3);
  border-block-start: 1px solid var(--color-border);
}

.tables-page__archived-heading {
  margin: 0;
  font-size: var(--font-size-lead);
}

.tables-page__archived-toggle {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  inline-size: 100%;
  min-block-size: var(--target-min);
  padding: var(--space-2);
  border: 0;
  border-radius: var(--radius-2);
  font: inherit;
  color: var(--color-text);
  background: none;
  cursor: pointer;
}

.tables-page__archived-toggle:hover {
  background: var(--color-surface-muted);
}

.tables-page__archived-toggle:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

.tables-page__archived-chevron {
  margin-inline-start: auto;
  transition: transform var(--duration-fast);
}

.tables-page__archived-chevron--open {
  transform: rotate(180deg);
}

.tables-page__archived-body {
  display: grid;
  gap: var(--space-3);
}

.tables-page__archived-lead {
  margin: 0;
  color: var(--color-text-muted);
}

.tables-page__archived-list {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.tables-page__archived-item {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-3);
  background: var(--color-surface);
}

.tables-page__archived-info {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-2);
  align-items: center;
  min-inline-size: 0;
}

.tables-page__archived-name {
  overflow-wrap: anywhere;
  font-size: var(--font-size-lead);
  font-weight: var(--font-weight-bold);
}

.tables-page__archived-meta {
  display: inline-flex;
  gap: var(--space-1);
  align-items: center;
  color: var(--color-text-muted);
}

/* Full width under the name on phones (thumb reach); beside it once there is room. */
.tables-page__archived-show {
  flex: 1 1 100%;
}

@media (width >= 600px) {
  .tables-page__archived-show {
    flex: 0 0 auto;
  }
}

@media (width >= 840px) {
  .tables-page__header {
    grid-template-columns: 1fr auto;
    align-items: end;
  }

  .tables-page__toolbar {
    flex-direction: row;
  }

  .tables-page__list {
    grid-template-columns: repeat(auto-fill, minmax(24rem, 1fr));
  }
}
</style>
