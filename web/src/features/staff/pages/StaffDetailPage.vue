<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowLeft, CircleCheck, KeyRound, Lock, LockOpen } from 'lucide-vue-next';
import OwnerShell from '@/app/layouts/OwnerShell.vue';
import BaseButton from '@/components/BaseButton.vue';
import ConfirmSheet from '@/components/ConfirmSheet.vue';
import FormAlert from '@/components/FormAlert.vue';
import FormField from '@/components/FormField.vue';
import StatusChip from '@/components/StatusChip.vue';
import { ROLE_ICONS } from '@/features/roles/role-icons';
import RadioCardGroup from '@/components/RadioCardGroup.vue';
import ErrorState from '@/components/ErrorState.vue';
import LoadingState from '@/components/LoadingState.vue';
import {
  RESTAURANT_ROLES,
  describeStaffError,
  getStaff,
  nameOf,
  resetStaffPassword,
  updateStaff,
  type RestaurantRole,
  type StaffMember,
} from '@/features/staff/services/staff.service';
import { useSessionStore } from '@/stores/session';

const MIN_PASSWORD = 10;

const props = defineProps<{ id: string }>();
const { t } = useI18n();
const session = useSessionStore();

const member = ref<StaffMember>();
const loadError = ref<string>();
const role = ref<RestaurantRole | ''>('');
const notice = ref<string>();
const actionError = ref<string>();
const busy = ref<'role' | 'access' | 'password'>();
const sheet = ref<'disable' | 'password'>();
const newPassword = ref('');
const passwordError = ref<string>();

const roleOptions = computed(() =>
  RESTAURANT_ROLES.map((value) => ({
    value: value as RestaurantRole | '',
    title: t(`roles.names.${value}`),
    body: t(`staff.roleHints.${value}`),
  })),
);

const isSelf = computed(() => member.value?.id === session.me?.user.id);
const name = computed(() => (member.value ? nameOf(member.value) : ''));

const load = async () => {
  loadError.value = undefined;
  try {
    member.value = await getStaff(props.id);
    role.value = member.value.role;
  } catch (error: unknown) {
    loadError.value = describeStaffError(error);
  }
};
onMounted(load);

const run = async (kind: 'role' | 'access' | 'password', action: () => Promise<string>) => {
  busy.value = kind;
  notice.value = undefined;
  actionError.value = undefined;
  try {
    notice.value = await action();
    sheet.value = undefined;
  } catch (error: unknown) {
    actionError.value = t(describeStaffError(error));
    sheet.value = undefined;
  } finally {
    busy.value = undefined;
  }
};

const saveRole = () =>
  run('role', async () => {
    if (role.value === '') throw new Error('no role');
    member.value = await updateStaff(props.id, { role: role.value });
    return t('staff.detail.roleSaved', { name: name.value });
  });

const setActive = (active: boolean) =>
  run('access', async () => {
    member.value = await updateStaff(props.id, { active });
    return t(active ? 'staff.detail.enabledDone' : 'staff.detail.disabledDone', {
      name: name.value,
    });
  });

const openPasswordSheet = () => {
  newPassword.value = '';
  passwordError.value = undefined;
  sheet.value = 'password';
};

const savePassword = async () => {
  if (newPassword.value.length < MIN_PASSWORD) {
    passwordError.value = t('staff.errors.password');
    return;
  }
  await run('password', async () => {
    await resetStaffPassword(props.id, newPassword.value);
    return t('staff.detail.passwordSaved', { name: name.value });
  });
};
</script>

<template>
  <OwnerShell>
    <RouterLink to="/quan-ly/nhan-vien" class="staff-detail__back">
      <ArrowLeft :size="20" aria-hidden="true" />
      {{ t('staff.back') }}
    </RouterLink>

    <ErrorState
      v-if="loadError"
      class="staff-detail__error"
      :message="t(loadError)"
      :retry-label="t('staff.retry')"
      @retry="load"
    />

    <LoadingState
      v-else-if="!member"
      class="staff-detail__error"
      :label="t('staff.loading')"
      :rows="2"
    />

    <template v-else>
      <header class="staff-detail__head">
        <h1 class="staff-detail__title">{{ name }}</h1>
        <p class="staff-detail__email">{{ member.email }}</p>
        <span class="staff-detail__chips">
          <StatusChip :label="t(`roles.names.${member.role}`)" :icon="ROLE_ICONS[member.role]" />
          <StatusChip v-if="isSelf" tone="success" :label="t('staff.you')" />
          <StatusChip
            v-if="!member.active"
            tone="danger"
            :label="t('staff.disabled')"
            :icon="Lock"
          />
        </span>
      </header>

      <p v-if="notice" class="staff-detail__notice" role="status">
        <CircleCheck :size="20" aria-hidden="true" />
        {{ notice }}
      </p>
      <FormAlert v-if="actionError" :message="actionError" />
      <p v-if="isSelf" class="staff-detail__note">{{ t('staff.detail.selfNote') }}</p>

      <div class="staff-detail__sections">
        <section class="staff-detail__section" aria-labelledby="staff-role">
          <h2 id="staff-role" class="staff-detail__section-title">
            {{ t('staff.detail.roleSection') }}
          </h2>
          <p v-if="isSelf" class="staff-detail__text">
            {{ t(`roles.names.${member.role}`) }} — {{ t(`staff.roleHints.${member.role}`) }}
          </p>
          <form v-else class="staff-detail__form" @submit.prevent="saveRole">
            <RadioCardGroup
              v-model="role"
              :legend="t('staff.detail.roleLegend')"
              :options="roleOptions"
            />
            <BaseButton
              type="submit"
              variant="secondary"
              size="lg"
              :disabled="role === member.role"
              :loading="busy === 'role'"
              >{{ t('staff.detail.saveRole') }}</BaseButton
            >
          </form>
        </section>

        <template v-if="!isSelf">
          <section class="staff-detail__section" aria-labelledby="staff-password">
            <h2 id="staff-password" class="staff-detail__section-title">
              {{ t('staff.detail.passwordSection') }}
            </h2>
            <p class="staff-detail__text">{{ t('staff.detail.passwordLead') }}</p>
            <BaseButton variant="secondary" size="lg" @click="openPasswordSheet">
              <KeyRound :size="20" aria-hidden="true" />
              {{ t('staff.detail.resetPassword') }}
            </BaseButton>
          </section>

          <section class="staff-detail__section" aria-labelledby="staff-access">
            <h2 id="staff-access" class="staff-detail__section-title">
              {{ t('staff.detail.accessSection') }}
            </h2>
            <template v-if="member.active">
              <p class="staff-detail__text">{{ t('staff.detail.disableLead') }}</p>
              <BaseButton variant="danger" size="lg" @click="sheet = 'disable'">
                <Lock :size="20" aria-hidden="true" />
                {{ t('staff.detail.disable') }}
              </BaseButton>
            </template>
            <template v-else>
              <p class="staff-detail__text">{{ t('staff.detail.disabledNote', { name }) }}</p>
              <BaseButton size="lg" :loading="busy === 'access'" @click="setActive(true)">
                <LockOpen :size="20" aria-hidden="true" />
                {{ t('staff.detail.enable') }}
              </BaseButton>
            </template>
          </section>
        </template>
      </div>

      <ConfirmSheet
        :open="sheet === 'disable'"
        variant="danger"
        :title="t('staff.detail.disableTitle', { name })"
        :confirm-label="t('staff.detail.disableConfirm')"
        :cancel-label="t('sheet.cancel')"
        :busy="busy === 'access'"
        @confirm="setActive(false)"
        @cancel="sheet = undefined"
      >
        <p class="staff-detail__sheet-text">{{ t('staff.detail.disableBody', { name }) }}</p>
      </ConfirmSheet>
      <ConfirmSheet
        :open="sheet === 'password'"
        :title="t('staff.detail.resetTitle', { name })"
        :confirm-label="t('staff.detail.resetConfirm')"
        :cancel-label="t('sheet.cancel')"
        :busy="busy === 'password'"
        @confirm="savePassword"
        @cancel="sheet = undefined"
      >
        <p class="staff-detail__sheet-text">{{ t('staff.detail.resetBody', { name }) }}</p>
        <FormField
          v-model="newPassword"
          type="password"
          :label="t('staff.detail.newPassword')"
          :hint="t('staff.form.passwordHint')"
          autocomplete="new-password"
          required
          :error="passwordError"
        />
      </ConfirmSheet>
    </template>
  </OwnerShell>
</template>

<style scoped>
.staff-detail__back {
  display: inline-flex;
  gap: var(--space-1);
  align-items: center;
  min-block-size: var(--target-min);
  color: var(--color-primary);
  text-decoration: none;
}

.staff-detail__error {
  margin-block-start: var(--space-3);
}

.staff-detail__sheet-text {
  margin: 0 0 var(--space-3);
}

.staff-detail__head {
  display: grid;
  gap: var(--space-1);
  margin-block: var(--space-2) var(--space-4);
}

.staff-detail__title {
  margin: 0;
  font-size: var(--font-size-title);
  overflow-wrap: anywhere;
}

.staff-detail__email {
  margin: 0;
  color: var(--color-text-muted);
  overflow-wrap: anywhere;
}

.staff-detail__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-block-start: var(--space-1);
}

.staff-detail__notice {
  display: flex;
  gap: var(--space-2);
  align-items: flex-start;
  margin-block: 0 var(--space-3);
  padding: var(--space-3);
  border-radius: var(--radius-1);
  background: var(--color-success-bg);
}

.staff-detail__note {
  margin-block: 0 var(--space-3);
  color: var(--color-text-muted);
}

.staff-detail__sections {
  display: grid;
  gap: var(--space-3);
  margin-block-start: var(--space-3);
}

@media (width >= 840px) {
  .staff-detail__sections {
    grid-template-columns: 3fr 2fr;
    align-items: start;
  }

  .staff-detail__section:first-child {
    grid-row: span 2;
  }
}

.staff-detail__section {
  display: grid;
  gap: var(--space-3);
  justify-items: start;
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  background: var(--color-surface);
}

.staff-detail__section-title {
  margin: 0;
  font-size: var(--font-size-lead);
}

.staff-detail__text {
  margin: 0;
  color: var(--color-text-muted);
}

.staff-detail__form {
  display: grid;
  gap: var(--space-3);
  justify-items: start;
  inline-size: 100%;
}

.staff-detail__form > :first-child {
  inline-size: 100%;
}
</style>
