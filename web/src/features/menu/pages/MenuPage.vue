<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowDown, ArrowUp, Eye, Pencil, Plus, Trash2, UtensilsCrossed } from 'lucide-vue-next';
import OwnerShell from '@/app/layouts/OwnerShell.vue';
import { ApiError } from '@/api/client';
import BaseButton from '@/components/BaseButton.vue';
import ConfirmSheet from '@/components/ConfirmSheet.vue';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import FormAlert from '@/components/FormAlert.vue';
import IconButton from '@/components/IconButton.vue';
import LoadingState from '@/components/LoadingState.vue';
import StatusChip from '@/components/StatusChip.vue';
import { useSessionStore } from '@/stores/session';
import { useToastStore } from '@/stores/toast';
import { menuApi } from '../api';
import CategorySheet from '../components/CategorySheet.vue';
import ItemSheet from '../components/ItemSheet.vue';
import MenuItemRow from '../components/MenuItemRow.vue';
import StationPanel from '../components/StationPanel.vue';
import StationSheet from '../components/StationSheet.vue';
import { describeMenuError, type Message } from '../errors';
import type { Category, MenuItem, Station } from '../types';
import { useMenu } from '../useMenu';

type Target =
  | { kind: 'item'; id: string; name: string }
  | { kind: 'category'; id: string; name: string }
  | { kind: 'station'; id: string; name: string };

type Sheet =
  | { kind: 'item'; item?: MenuItem; categoryId?: string }
  | { kind: 'category'; category?: Category; first?: boolean }
  | { kind: 'station'; station?: Station }
  | { kind: 'confirm'; target: Target };

const { t } = useI18n();
const session = useSessionStore();
const toast = useToastStore();
const state = useMenu();
const { status, categories, stations, itemCount, stationName } = state;

const role = computed(() => session.me?.user.role);
const canEdit = computed(() => role.value === 'owner');
const canToggle = computed(() => role.value === 'owner' || role.value === 'kitchen');

const sheet = ref<Sheet | null>(null);
const notice = ref<Message>();
const confirmBusy = ref(false);
const confirmError = ref<string>();

onMounted(() => state.load());

const close = () => {
  sheet.value = null;
  confirmError.value = undefined;
};

/** The first item needs a category: ask for one first, then open the item form. */
const addItem = (categoryId?: string) => {
  notice.value = undefined;
  sheet.value =
    categories.value.length === 0
      ? { kind: 'category', first: true }
      : { kind: 'item', categoryId };
};

const onItemSaved = (item: MenuItem) => {
  const edited = sheet.value?.kind === 'item' && sheet.value.item !== undefined;
  state.putItem(item);
  close();
  toast.show(t(edited ? 'menu.toast.itemSaved' : 'menu.toast.itemCreated', { name: item.name }));
};

const onCategorySaved = (category: Category) => {
  const current = sheet.value?.kind === 'category' ? sheet.value : undefined;
  state.putCategory(category);
  sheet.value = current?.first ? { kind: 'item', categoryId: category.id } : null;
  toast.show(
    t(current?.category ? 'menu.toast.categorySaved' : 'menu.toast.categoryCreated', {
      name: category.name,
    }),
  );
};

const onStationSaved = (station: Station) => {
  const edited = sheet.value?.kind === 'station' && sheet.value.station !== undefined;
  state.putStation(station);
  close();
  toast.show(
    t(edited ? 'menu.toast.stationSaved' : 'menu.toast.stationCreated', { name: station.name }),
  );
};

/** A row someone else removed (404) reloads the menu; other failures keep the screen as it was. */
const reportFailure = async (error: unknown, fallback?: Message) => {
  const gone = error instanceof ApiError && error.status === 404;
  notice.value = gone || !fallback ? describeMenuError(error, 'item').form : fallback;
  if (gone) await state.load();
};

const toggle = async (item: MenuItem, available: boolean) => {
  notice.value = undefined;
  try {
    await state.setAvailability(item, available);
    toast.show(t(available ? 'menu.toast.available' : 'menu.toast.soldOut', { name: item.name }));
  } catch (error: unknown) {
    await reportFailure(error, { key: 'menu.errors.toggleFailed', params: { name: item.name } });
  }
};

const move = async (category: Category, direction: 'up' | 'down') => {
  notice.value = undefined;
  try {
    const { categories: order } = await menuApi.moveCategory(category.id, direction);
    state.orderCategories(order);
  } catch (error: unknown) {
    await reportFailure(error);
  }
};

const askRemove = (target: Target) => {
  notice.value = undefined;
  confirmError.value = undefined;
  sheet.value = { kind: 'confirm', target };
};

const confirmText = computed(() => {
  if (sheet.value?.kind !== 'confirm') return { title: '', body: '' };
  const { kind, name } = sheet.value.target;
  return {
    title: t(`menu.${kind}.confirmTitle`),
    body: t(`menu.${kind}.confirmBody`, { name }),
  };
});

const remove = async () => {
  if (sheet.value?.kind !== 'confirm') return;
  const { target } = sheet.value;
  confirmBusy.value = true;
  confirmError.value = undefined;
  try {
    if (target.kind === 'item') {
      await menuApi.deleteItem(target.id);
      state.removeItem(target.id);
    } else if (target.kind === 'category') {
      await menuApi.deleteCategory(target.id);
      state.removeCategory(target.id);
    } else {
      await menuApi.deleteStation(target.id);
      state.removeStation(target.id);
    }
    close();
    toast.show(t('menu.toast.deleted', { name: target.name }));
  } catch (error: unknown) {
    const message = describeMenuError(error, target.kind).form ?? { key: 'errors.unexpected' };
    confirmError.value = t(message.key, message.params ?? {});
  } finally {
    confirmBusy.value = false;
  }
};
</script>

<template>
  <OwnerShell>
    <div class="menu-page">
      <header class="menu-page__header">
        <div class="menu-page__heading">
          <h1 class="menu-page__title">{{ t('menu.title') }}</h1>
          <p class="menu-page__lead">{{ t('menu.lead') }}</p>
        </div>
        <div v-if="status === 'ready'" class="menu-page__actions">
          <RouterLink to="/quan-ly/thuc-don/xem-truoc" class="menu-page__preview">
            <Eye :size="20" aria-hidden="true" />
            {{ t('menu.preview') }}
          </RouterLink>
          <BaseButton v-if="canEdit && itemCount > 0" @click="addItem()">
            <Plus :size="20" aria-hidden="true" />
            {{ t('menu.addItem') }}
          </BaseButton>
        </div>
      </header>

      <FormAlert v-if="notice" :message="t(notice.key, notice.params ?? {})" />

      <LoadingState v-if="status === 'loading'" :label="t('menu.loading')" />
      <ErrorState
        v-else-if="status === 'error'"
        :message="t('menu.loadFailed')"
        :retry-label="t('menu.retry')"
        @retry="state.load()"
      />
      <div v-else class="menu-page__layout">
        <div class="menu-page__menu">
          <EmptyState
            v-if="itemCount === 0"
            :title="t('menu.empty.title')"
            :body="t('menu.empty.body')"
          >
            <template #icon><UtensilsCrossed :size="28" aria-hidden="true" /></template>
            <template v-if="canEdit" #action>
              <BaseButton size="lg" @click="addItem()">
                <Plus :size="20" aria-hidden="true" />
                {{ t('menu.empty.action') }}
              </BaseButton>
            </template>
          </EmptyState>

          <section
            v-for="(category, index) in categories"
            :key="category.id"
            class="menu-page__category"
            :aria-labelledby="`category-${category.id}`"
          >
            <header class="menu-page__category-header">
              <h2 :id="`category-${category.id}`" class="menu-page__category-title">
                {{ category.name }}
              </h2>
              <StatusChip v-if="category.isMain" :label="t('menu.category.main')" tone="success" />
              <span class="menu-page__count">{{
                t('menu.category.count', { n: category.items.length })
              }}</span>
              <div v-if="canEdit" class="menu-page__category-actions">
                <IconButton
                  :icon="ArrowUp"
                  :disabled="index === 0"
                  :label="t('menu.category.moveUp', { name: category.name })"
                  @click="move(category, 'up')"
                />
                <IconButton
                  :icon="ArrowDown"
                  :disabled="index === categories.length - 1"
                  :label="t('menu.category.moveDown', { name: category.name })"
                  @click="move(category, 'down')"
                />
                <IconButton
                  :icon="Pencil"
                  :label="t('menu.category.edit', { name: category.name })"
                  @click="sheet = { kind: 'category', category }"
                />
                <IconButton
                  :icon="Trash2"
                  :label="t('menu.category.remove', { name: category.name })"
                  @click="askRemove({ kind: 'category', id: category.id, name: category.name })"
                />
              </div>
            </header>
            <ul v-if="category.items.length > 0" class="menu-page__items">
              <MenuItemRow
                v-for="item in category.items"
                :key="item.id"
                :item="item"
                :station-name="stationName(item.stationId)"
                :can-edit="canEdit"
                :can-toggle="canToggle"
                @toggle="toggle(item, $event)"
                @edit="sheet = { kind: 'item', item }"
              />
            </ul>
            <div v-else class="menu-page__category-empty">
              <span>{{ t('menu.empty.category') }}</span>
              <BaseButton v-if="canEdit" variant="ghost" @click="addItem(category.id)">
                <Plus :size="18" aria-hidden="true" />
                {{ t('menu.category.addHere') }}
              </BaseButton>
            </div>
          </section>

          <BaseButton
            v-if="canEdit && categories.length > 0"
            variant="secondary"
            block
            @click="sheet = { kind: 'category' }"
          >
            <Plus :size="20" aria-hidden="true" />
            {{ t('menu.addCategory') }}
          </BaseButton>
        </div>

        <aside class="menu-page__aside">
          <StationPanel
            :stations="stations"
            :can-edit="canEdit"
            @add="sheet = { kind: 'station' }"
            @edit="sheet = { kind: 'station', station: $event }"
            @remove="askRemove({ kind: 'station', id: $event.id, name: $event.name })"
          />
        </aside>
      </div>
    </div>

    <ItemSheet
      v-if="sheet?.kind === 'item'"
      :item="sheet.item"
      :category-id="sheet.categoryId"
      :categories="categories"
      :stations="stations"
      @saved="onItemSaved"
      @remove="askRemove({ kind: 'item', id: $event.id, name: $event.name })"
      @close="close"
    />
    <CategorySheet
      v-else-if="sheet?.kind === 'category'"
      :category="sheet.category"
      :hint="sheet.first ? t('menu.category.firstHint') : undefined"
      @saved="onCategorySaved"
      @close="close"
    />
    <StationSheet
      v-else-if="sheet?.kind === 'station'"
      :station="sheet.station"
      @saved="onStationSaved"
      @close="close"
    />
    <ConfirmSheet
      :open="sheet?.kind === 'confirm'"
      :title="confirmText.title"
      :confirm-label="t('menu.delete')"
      :cancel-label="t('menu.cancel')"
      variant="danger"
      :busy="confirmBusy"
      @confirm="remove"
      @cancel="close"
    >
      <div class="menu-page__confirm">
        <p class="menu-page__confirm-text">{{ confirmText.body }}</p>
        <FormAlert v-if="confirmError" :message="confirmError" />
      </div>
    </ConfirmSheet>
  </OwnerShell>
</template>

<style scoped>
.menu-page {
  display: grid;
  gap: var(--space-4);
}

.menu-page__header {
  display: grid;
  gap: var(--space-3);
}

.menu-page__title {
  margin: 0;
  font-size: var(--font-size-title);
}

.menu-page__lead {
  max-inline-size: 36rem;
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
}

.menu-page__actions {
  display: flex;
  flex-direction: column-reverse;
  gap: var(--space-2);
}

.menu-page__preview {
  display: inline-flex;
  gap: var(--space-2);
  align-items: center;
  justify-content: center;
  min-block-size: var(--target-min);
  padding-inline: var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-2);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
  text-decoration: none;
  background: var(--color-surface);
}

.menu-page__layout {
  display: grid;
  gap: var(--space-4);
  align-items: start;
}

@media (width >= 840px) {
  .menu-page__header {
    grid-template-columns: 1fr auto;
    align-items: end;
  }

  .menu-page__actions {
    flex-direction: row;
    align-items: center;
  }

  .menu-page__layout {
    grid-template-columns: minmax(0, 1fr) 20rem;
  }

  .menu-page__aside {
    position: sticky;
    inset-block-start: 0;
  }
}

.menu-page__menu {
  display: grid;
  gap: var(--space-4);
}

.menu-page__category {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  background: var(--color-surface);
  box-shadow: var(--shadow-1);
}

.menu-page__category-header {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
  background: var(--color-surface-muted);
}

.menu-page__category-title {
  margin: 0;
  font-size: var(--font-size-lead);
}

.menu-page__count {
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
}

.menu-page__category-actions {
  display: flex;
  margin-inline-start: auto;
}

.menu-page__items {
  margin: 0;
  padding: 0;
  list-style: none;
}

.menu-page__confirm {
  display: grid;
  gap: var(--space-3);
}

.menu-page__confirm-text {
  margin: 0;
}

.menu-page__category-empty {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  color: var(--color-text-muted);
}
</style>
