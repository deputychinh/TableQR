<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { CalendarDays, Hourglass } from 'lucide-vue-next';
import StaffShell from '@/app/layouts/StaffShell.vue';
import type { StaffRole } from '@/stores/session';

/** Placeholder home for cashier, waiter and kitchen until their screens arrive (AC14). */
const props = defineProps<{ role: Exclude<StaffRole, 'owner' | 'platform_admin'> }>();
const { t } = useI18n();
const roleName = computed(() => t(`roles.names.${props.role}`));
</script>

<template>
  <StaffShell :title="roleName">
    <section class="role-home" :aria-labelledby="`role-home-${role}`">
      <span class="role-home__icon"><Hourglass :size="32" aria-hidden="true" /></span>
      <h1 :id="`role-home-${role}`" class="role-home__title">{{ t('roles.soon.title') }}</h1>
      <p class="role-home__body">{{ t('roles.soon.body', { role: roleName.toLowerCase() }) }}</p>
      <RouterLink v-if="role !== 'kitchen'" to="/dat-ban" class="role-home__link">
        <CalendarDays :size="20" aria-hidden="true" />
        {{ t('booking.nav') }}
      </RouterLink>
    </section>
  </StaffShell>
</template>

<style scoped>
.role-home {
  display: grid;
  gap: var(--space-3);
  justify-items: center;
  max-inline-size: 32rem;
  margin: var(--space-5) auto 0;
  padding: var(--space-5) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  text-align: center;
  background: var(--color-surface);
}

.role-home__icon {
  display: grid;
  place-items: center;
  inline-size: 4rem;
  block-size: 4rem;
  border-radius: 50%;
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.role-home__title {
  margin: 0;
  font-size: var(--font-size-title);
}

.role-home__body {
  margin: 0;
  color: var(--color-text-muted);
}

/* Until the floor screens arrive (TQR-015/019), the booking list is reachable from here. */
.role-home__link {
  display: inline-flex;
  gap: var(--space-2);
  align-items: center;
  min-block-size: var(--target-min);
  padding-inline: var(--space-4);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-2);
  font-weight: var(--font-weight-bold);
  color: var(--color-primary);
  text-decoration: none;
}
</style>
