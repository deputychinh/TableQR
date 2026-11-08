<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Ban, CircleCheck, RotateCcw, Store } from 'lucide-vue-next';
import StaffShell from '@/app/layouts/StaffShell.vue';
import BaseButton from '@/components/BaseButton.vue';
import ConfirmSheet from '@/components/ConfirmSheet.vue';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import LoadingState from '@/components/LoadingState.vue';
import FormAlert from '@/components/FormAlert.vue';
import StatusChip from '@/components/StatusChip.vue';
import { useToastStore } from '@/stores/toast';
import {
  describeAdminError,
  listRestaurants,
  setRestaurantStatus,
  type AdminRestaurant,
} from '@/features/admin/services/admin.service';

const { t } = useI18n();
const restaurants = ref<AdminRestaurant[]>();
const total = ref(0);
const loading = ref(false);
const loadError = ref<string>();
const pending = ref<AdminRestaurant>();
const busy = ref(false);
const actionError = ref<string>();
const toast = useToastStore();

const suspending = computed(() => pending.value?.status === 'active');
const hasMore = computed(() => (restaurants.value?.length ?? 0) < total.value);

const load = async (more = false) => {
  loading.value = true;
  loadError.value = undefined;
  try {
    const page = await listRestaurants(more ? (restaurants.value?.length ?? 0) : 0);
    restaurants.value = more ? [...(restaurants.value ?? []), ...page.items] : page.items;
    total.value = page.total;
  } catch (error: unknown) {
    const key = describeAdminError(error);
    loadError.value = key === 'errors.unexpected' ? 'admin.errors.load' : key;
  } finally {
    loading.value = false;
  }
};
onMounted(() => load());

const ask = (restaurant: AdminRestaurant) => {
  actionError.value = undefined;
  pending.value = restaurant;
};

const confirm = async () => {
  const target = pending.value;
  if (!target) return;
  busy.value = true;
  actionError.value = undefined;
  try {
    const updated = await setRestaurantStatus(
      target.id,
      target.status === 'active' ? 'suspend' : 'reactivate',
    );
    restaurants.value = restaurants.value?.map((r) => (r.id === updated.id ? updated : r));
    toast.show(
      t(updated.status === 'suspended' ? 'admin.suspended' : 'admin.reactivated', {
        name: updated.name,
      }),
    );
    pending.value = undefined;
  } catch (error: unknown) {
    actionError.value = t(describeAdminError(error));
  } finally {
    busy.value = false;
  }
};

const dateOf = (iso: string): string => new Date(iso).toLocaleDateString('vi-VN');
</script>

<template>
  <StaffShell :title="t('admin.shellTitle')">
    <h1 class="admin-page__title">{{ t('admin.title') }}</h1>
    <p class="admin-page__lead">{{ t('admin.lead') }}</p>

    <LoadingState v-if="loading && !restaurants" :label="t('admin.loading')" />

    <ErrorState
      v-else-if="loadError && !restaurants"
      :message="t(loadError)"
      :retry-label="t('admin.retry')"
      @retry="load()"
    />

    <EmptyState v-else-if="restaurants && restaurants.length === 0" :title="t('admin.empty')" />

    <template v-else-if="restaurants">
      <p class="admin-page__count">{{ t('admin.count', { n: total }) }}</p>
      <ul class="admin-page__list">
        <li v-for="restaurant in restaurants" :key="restaurant.id" class="admin-page__item">
          <span class="admin-page__icon" aria-hidden="true"><Store :size="24" /></span>
          <span class="admin-page__info">
            <span class="admin-page__name">{{ restaurant.name }}</span>
            <span class="admin-page__meta">
              {{ restaurant.ownerEmail ?? t('admin.noOwner') }} ·
              {{ t('admin.staffCount', { n: restaurant.staffCount }) }} ·
              {{ dateOf(restaurant.createdAt) }}
            </span>
            <StatusChip
              class="admin-page__chip"
              :tone="restaurant.status === 'active' ? 'success' : 'danger'"
              :icon="restaurant.status === 'active' ? CircleCheck : Ban"
              :label="t(`admin.status.${restaurant.status}`)"
            />
          </span>
          <BaseButton
            :variant="restaurant.status === 'active' ? 'secondary' : 'primary'"
            :aria-label="`${t(restaurant.status === 'active' ? 'admin.suspend' : 'admin.reactivate')} ${restaurant.name}`"
            @click="ask(restaurant)"
          >
            <component
              :is="restaurant.status === 'active' ? Ban : RotateCcw"
              :size="18"
              aria-hidden="true"
            />
            {{ t(restaurant.status === 'active' ? 'admin.suspend' : 'admin.reactivate') }}
          </BaseButton>
        </li>
      </ul>
      <FormAlert v-if="loadError" :message="t(loadError)" />
      <BaseButton v-if="hasMore" variant="secondary" :loading="loading" @click="load(true)">{{
        t('admin.more')
      }}</BaseButton>
    </template>

    <ConfirmSheet
      :open="pending !== undefined"
      :variant="suspending ? 'danger' : 'primary'"
      :title="
        t(suspending ? 'admin.suspendTitle' : 'admin.reactivateTitle', {
          name: pending?.name ?? '',
        })
      "
      :confirm-label="t(suspending ? 'admin.suspend' : 'admin.reactivate')"
      :cancel-label="t('sheet.cancel')"
      :busy="busy"
      @confirm="confirm"
      @cancel="pending = undefined"
    >
      <p class="admin-page__sheet-text">
        {{ t(suspending ? 'admin.suspendBody' : 'admin.reactivateBody') }}
      </p>
      <FormAlert v-if="actionError" :message="actionError" />
    </ConfirmSheet>
  </StaffShell>
</template>

<style scoped>
.admin-page__title {
  margin: 0;
  font-size: var(--font-size-title);
}

.admin-page__lead {
  margin-block: var(--space-2) var(--space-4);
  color: var(--color-text-muted);
}

.admin-page__count {
  margin-block: 0 var(--space-2);
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
}

.admin-page__list {
  display: grid;
  gap: var(--space-3);
  margin: 0 0 var(--space-3);
  padding: 0;
  list-style: none;
}

.admin-page__sheet-text {
  margin: 0 0 var(--space-3);
}

.admin-page__item {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  background: var(--color-surface);
  box-shadow: var(--shadow-1);
}

.admin-page__item > :last-child {
  grid-column: 1 / -1;
}

@media (width >= 600px) {
  .admin-page__item {
    grid-template-columns: auto 1fr auto;
  }

  .admin-page__item > :last-child {
    grid-column: auto;
  }
}

.admin-page__icon {
  display: grid;
  place-items: center;
  inline-size: 3rem;
  block-size: 3rem;
  border-radius: var(--radius-2);
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.admin-page__info {
  display: grid;
  gap: var(--space-1);
  min-inline-size: 0;
}

.admin-page__name {
  font-weight: var(--font-weight-bold);
}

.admin-page__meta {
  overflow-wrap: anywhere;
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
}

.admin-page__chip {
  justify-self: start;
}
</style>
