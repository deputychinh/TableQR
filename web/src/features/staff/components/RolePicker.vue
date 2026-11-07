<script setup lang="ts">
import { useId } from 'vue';
import { useI18n } from 'vue-i18n';
import { ROLE_ICONS } from '@/features/roles/role-icons';
import type { RestaurantRole } from '@/features/staff/services/staff.service';

/** Radio cards: one large target per role, with what that role can do. */
withDefaults(
  defineProps<{
    legend: string;
    roles: readonly RestaurantRole[];
    disabled?: boolean;
    error?: string;
  }>(),
  { disabled: false, error: undefined },
);
const model = defineModel<RestaurantRole | ''>({ required: true });
const { t } = useI18n();
const id = useId();
</script>

<template>
  <fieldset
    class="role-picker"
    :disabled="disabled"
    :aria-describedby="error ? `${id}-error` : undefined"
  >
    <legend class="role-picker__legend">{{ legend }}</legend>
    <label
      v-for="role in roles"
      :key="role"
      class="role-picker__option"
      :class="{ 'role-picker__option--checked': model === role }"
    >
      <input v-model="model" class="role-picker__input" type="radio" :name="id" :value="role" />
      <component :is="ROLE_ICONS[role]" :size="24" aria-hidden="true" class="role-picker__icon" />
      <span class="role-picker__text">
        <span class="role-picker__name">{{ t(`roles.names.${role}`) }}</span>
        <span class="role-picker__hint">{{ t(`staff.roleHints.${role}`) }}</span>
      </span>
    </label>
    <p v-if="error" :id="`${id}-error`" class="role-picker__error">{{ error }}</p>
  </fieldset>
</template>

<style scoped>
.role-picker {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  border: 0;
}

.role-picker__legend {
  margin-block-end: var(--space-1);
  padding: 0;
  font-weight: var(--font-weight-medium);
}

.role-picker__option {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  min-block-size: var(--target-large);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-2);
  background: var(--color-surface);
  cursor: pointer;
}

.role-picker__option--checked {
  border-width: 2px;
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}

.role-picker__option:focus-within {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}

.role-picker:disabled .role-picker__option {
  cursor: not-allowed;
  opacity: 0.6;
}

.role-picker__input {
  inline-size: 1.25rem;
  block-size: 1.25rem;
  margin: 0;
  accent-color: var(--color-primary);
}

.role-picker__icon {
  flex: none;
  color: var(--color-primary);
}

.role-picker__text {
  display: grid;
  gap: var(--space-1);
}

.role-picker__name {
  font-weight: var(--font-weight-bold);
}

.role-picker__hint {
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
}

.role-picker__error {
  margin: 0;
  font-size: var(--font-size-small);
  color: var(--color-danger);
}
</style>
