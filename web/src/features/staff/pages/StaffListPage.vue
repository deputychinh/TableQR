<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronRight, CircleCheck, Lock, UserPlus } from 'lucide-vue-next';
import OwnerShell from '@/app/layouts/OwnerShell.vue';
import BaseButton from '@/components/BaseButton.vue';
import FormAlert from '@/components/FormAlert.vue';
import StatusChip from '@/components/StatusChip.vue';
import { ROLE_ICONS } from '@/features/roles/role-icons';
import { useSessionStore } from '@/stores/session';
import {
  describeStaffError,
  listStaff,
  nameOf,
  type StaffMember,
} from '@/features/staff/services/staff.service';

const { t } = useI18n();
const session = useSessionStore();
const members = ref<StaffMember[]>();
const loadError = ref<string>();
const loading = ref(false);
/** Set by the add page through history state, so the name never goes into the URL. */
const added = ref<string | undefined>(
  typeof window.history.state?.added === 'string' ? window.history.state.added : undefined,
);

const others = computed(() => members.value?.filter((m) => m.id !== session.me?.user.id) ?? []);

const load = async () => {
  loading.value = true;
  loadError.value = undefined;
  try {
    members.value = await listStaff();
  } catch (error: unknown) {
    const key = describeStaffError(error);
    loadError.value = key === 'errors.unexpected' ? 'staff.errors.load' : key;
  } finally {
    loading.value = false;
  }
};

onMounted(load);
</script>

<template>
  <OwnerShell>
    <div class="staff-list__head">
      <div>
        <h1 class="staff-list__title">{{ t('staff.title') }}</h1>
        <p class="staff-list__lead">{{ t('staff.lead') }}</p>
      </div>
      <RouterLink to="/quan-ly/nhan-vien/them" class="staff-list__add">
        <UserPlus :size="20" aria-hidden="true" />
        {{ t('staff.add') }}
      </RouterLink>
    </div>

    <p v-if="added" class="staff-list__added" role="status">
      <CircleCheck :size="20" aria-hidden="true" />
      {{ t('staff.added', { name: added }) }}
    </p>

    <div v-if="loading && !members" class="staff-list__loading" :aria-label="t('staff.loading')">
      <span v-for="n in 3" :key="n" class="staff-list__skeleton" aria-hidden="true" />
    </div>

    <div v-else-if="loadError" class="staff-list__error">
      <FormAlert :message="t(loadError)" />
      <BaseButton variant="secondary" :loading="loading" @click="load">{{
        t('staff.retry')
      }}</BaseButton>
    </div>

    <template v-else-if="members">
      <ul class="staff-list__items">
        <li v-for="member in members" :key="member.id">
          <RouterLink :to="`/quan-ly/nhan-vien/${member.id}`" class="staff-list__item">
            <span class="staff-list__avatar" aria-hidden="true">{{
              nameOf(member).slice(0, 1).toUpperCase()
            }}</span>
            <span class="staff-list__who">
              <span class="staff-list__name">
                {{ nameOf(member) }}
                <span v-if="member.id === session.me?.user.id" class="staff-list__you"
                  >({{ t('staff.you') }})</span
                >
              </span>
              <span class="staff-list__email">{{ member.email }}</span>
              <span class="staff-list__chips">
                <StatusChip
                  :label="t(`roles.names.${member.role}`)"
                  :icon="ROLE_ICONS[member.role]"
                />
                <StatusChip
                  v-if="!member.active"
                  tone="danger"
                  :label="t('staff.disabled')"
                  :icon="Lock"
                />
              </span>
            </span>
            <ChevronRight :size="22" aria-hidden="true" class="staff-list__chevron" />
          </RouterLink>
        </li>
      </ul>
      <section v-if="others.length === 0" class="staff-list__empty">
        <h2 class="staff-list__empty-title">{{ t('staff.empty.title') }}</h2>
        <p class="staff-list__empty-body">{{ t('staff.empty.body') }}</p>
      </section>
    </template>
  </OwnerShell>
</template>

<style scoped>
.staff-list__head {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-3);
  margin-block-end: var(--space-4);
}

@media (width >= 840px) {
  .staff-list__head {
    grid-template-columns: 1fr auto;
    align-items: start;
  }
}

.staff-list__title {
  margin: 0;
  font-size: var(--font-size-title);
}

.staff-list__lead {
  margin-block: var(--space-2) 0;
  color: var(--color-text-muted);
}

.staff-list__add {
  display: inline-flex;
  gap: var(--space-2);
  align-items: center;
  justify-content: center;
  min-block-size: var(--target-large);
  padding-inline: var(--space-4);
  border-radius: var(--radius-2);
  font-size: var(--font-size-lead);
  font-weight: var(--font-weight-medium);
  color: var(--color-on-primary);
  text-decoration: none;
  background: var(--color-primary);
}

@media (hover: hover) {
  .staff-list__add:hover {
    background: var(--color-primary-hover);
  }

  .staff-list__item:hover {
    border-color: var(--color-primary);
  }
}

.staff-list__added {
  display: flex;
  gap: var(--space-2);
  align-items: flex-start;
  margin-block: 0 var(--space-4);
  padding: var(--space-3);
  border-radius: var(--radius-1);
  color: var(--color-text);
  background: var(--color-success-bg);
}

.staff-list__loading,
.staff-list__items {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

@media (width >= 840px) {
  .staff-list__loading,
  .staff-list__items {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.staff-list__skeleton {
  block-size: 6rem;
  border-radius: var(--radius-3);
  background: var(--color-surface-muted);
}

.staff-list__error {
  display: grid;
  gap: var(--space-3);
  justify-items: start;
}

.staff-list__item {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  block-size: 100%;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  color: var(--color-text);
  text-decoration: none;
  background: var(--color-surface);
  box-shadow: var(--shadow-1);
}

.staff-list__avatar {
  display: grid;
  flex: none;
  place-items: center;
  inline-size: 3rem;
  block-size: 3rem;
  border-radius: 50%;
  font-weight: var(--font-weight-bold);
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.staff-list__who {
  display: grid;
  flex: 1;
  gap: var(--space-1);
  min-inline-size: 0;
}

.staff-list__name {
  font-weight: var(--font-weight-bold);
  overflow-wrap: anywhere;
}

.staff-list__items > li {
  min-inline-size: 0;
}

.staff-list__you {
  font-weight: normal;
  color: var(--color-text-muted);
}

.staff-list__email {
  overflow: hidden;
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.staff-list__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-block-start: var(--space-1);
}

.staff-list__chevron {
  flex: none;
  color: var(--color-text-muted);
}

.staff-list__empty {
  margin-block-start: var(--space-4);
  padding: var(--space-4);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-3);
  text-align: center;
}

.staff-list__empty-title {
  margin: 0;
  font-size: var(--font-size-lead);
}

.staff-list__empty-body {
  margin-block: var(--space-2) 0;
  color: var(--color-text-muted);
}
</style>
