<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Plus, Printer, QrCode } from 'lucide-vue-next';
import { ApiError } from '@/api/client';
import OwnerShell from '@/app/layouts/OwnerShell.vue';
import BaseButton from '@/components/BaseButton.vue';
import ConfirmSheet from '@/components/ConfirmSheet.vue';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import FormAlert from '@/components/FormAlert.vue';
import LoadingState from '@/components/LoadingState.vue';
import { useSessionStore } from '@/stores/session';
import type { TableInput, TableItem } from '../api';
import TableCard from '../components/TableCard.vue';
import TableFormSheet from '../components/TableFormSheet.vue';
import { useTables } from '../composables/useTables';

const { t } = useI18n();
const router = useRouter();
const session = useSessionStore();
const { items, status, load, add, update, rotate, remove } = useTables();
const canManage = computed(() => session.me?.user.role === 'owner');
const origin = window.location.origin;

const notice = ref('');
const actionError = ref<string>();
const formOpen = ref(false);
const editing = ref<TableItem>();
const confirming = ref<{ kind: 'rotate' | 'delete'; table: TableItem }>();
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
  notice.value = t(current ? 'tables.saved' : 'tables.created', { name: table.name });
};

const confirmAction = async () => {
  const pending = confirming.value;
  if (!pending) return;
  confirmBusy.value = true;
  actionError.value = undefined;
  try {
    if (pending.kind === 'rotate') {
      await rotate(pending.table.id);
      notice.value = t('tables.rotate.done', { name: pending.table.name });
    } else {
      await remove(pending.table.id);
      notice.value = t('tables.delete.done', { name: pending.table.name });
    }
  } catch (error: unknown) {
    if (error instanceof ApiError && error.code === 'NOT_FOUND') {
      actionError.value = t('tables.errors.gone');
      await load();
    } else {
      actionError.value = t(
        error instanceof ApiError && error.code === 'NETWORK'
          ? 'errors.network'
          : 'errors.unexpected',
      );
    }
  } finally {
    confirmBusy.value = false;
    confirming.value = undefined;
  }
};

const printOne = (table: TableItem) =>
  router.push({ path: '/quan-ly/ban/in', query: { ban: table.id } });
const printAll = () => router.push('/quan-ly/ban/in');
</script>

<template>
  <OwnerShell>
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

      <p class="tables-page__notice" role="status" aria-live="polite">{{ notice }}</p>
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
    </div>

    <TableFormSheet :open="formOpen" :table="editing" :save="save" @close="formOpen = false" />
    <ConfirmSheet
      :open="confirming !== undefined"
      :title="
        confirming ? t(`tables.${confirming.kind}.title`, { name: confirming.table.name }) : ''
      "
      :confirm-label="confirming ? t(`tables.${confirming.kind}.confirm`) : ''"
      :cancel-label="t('tables.form.cancel')"
      :busy="confirmBusy"
      :variant="confirming?.kind === 'rotate' ? 'primary' : 'danger'"
      @confirm="confirmAction"
      @cancel="confirming = undefined"
    >
      <p v-if="confirming">{{ t(`tables.${confirming.kind}.body`) }}</p>
    </ConfirmSheet>
  </OwnerShell>
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

.tables-page__notice {
  margin: 0;
  padding: var(--space-3);
  border-radius: var(--radius-1);
  background: var(--color-success-bg);
}

.tables-page__notice:empty {
  display: none;
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
