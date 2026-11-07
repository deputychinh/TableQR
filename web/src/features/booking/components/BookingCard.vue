<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  AlarmClock,
  Armchair,
  CircleCheck,
  CircleX,
  Clock,
  Phone,
  UserX,
  Users,
} from 'lucide-vue-next';
import BaseButton from '@/components/BaseButton.vue';
import StatusChip from '@/components/StatusChip.vue';
import type { Booking, BookingStatus } from '../api';
import { formatClock, formatPhone } from '../time';

/** One booking of the staff day list (S15): time, guest, table, status (+ "Trễ") and actions. */
const props = defineProps<{ booking: Booking; now: number }>();
defineEmits<{ confirm: []; move: []; seat: []; cancel: []; noShow: [] }>();
const { t } = useI18n();

const CHIP = {
  pending: { tone: 'warning', icon: Clock },
  confirmed: { tone: 'success', icon: CircleCheck },
  seated: { tone: 'neutral', icon: Armchair },
  cancelled: { tone: 'danger', icon: CircleX },
  no_show: { tone: 'danger', icon: UserX },
} as const satisfies Record<BookingStatus, unknown>;

const waiting = computed(() => ['pending', 'confirmed'].includes(props.booking.status));
const late = computed(
  () => waiting.value && (props.booking.late || props.now >= Date.parse(props.booking.lateAt)),
);
const started = computed(() => props.now >= Date.parse(props.booking.startsAt));
const name = computed(() => props.booking.guestName ?? t('booking.staff.guest'));
</script>

<template>
  <article
    class="booking-card"
    :class="{ 'booking-card--late': late, 'booking-card--closed': !waiting }"
    :aria-labelledby="`booking-${booking.id}`"
  >
    <header class="booking-card__head">
      <p class="booking-card__time">
        {{
          t('booking.staff.time', {
            from: formatClock(booking.startsAt),
            to: formatClock(booking.endsAt),
          })
        }}
      </p>
      <div class="booking-card__chips">
        <StatusChip
          :label="t(`booking.status.${booking.status}`)"
          :tone="CHIP[booking.status].tone"
          :icon="CHIP[booking.status].icon"
        />
        <StatusChip
          v-if="late"
          :label="t('booking.status.late')"
          tone="warning"
          :icon="AlarmClock"
        />
      </div>
    </header>
    <h2 :id="`booking-${booking.id}`" class="booking-card__name">{{ name }}</h2>
    <ul class="booking-card__facts">
      <li>
        <Users :size="18" aria-hidden="true" />
        {{ t('booking.staff.party', { n: booking.partySize }) }}
      </li>
      <li>
        <Armchair :size="18" aria-hidden="true" />
        {{ t('booking.staff.table', { name: booking.tableName }) }}
      </li>
      <li v-if="booking.guestPhone">
        <Phone :size="18" aria-hidden="true" />
        <a
          class="booking-card__phone"
          :href="`tel:${booking.guestPhone}`"
          :aria-label="t('booking.staff.phoneCall', { phone: formatPhone(booking.guestPhone) })"
        >
          {{ formatPhone(booking.guestPhone) }}
        </a>
      </li>
    </ul>
    <p v-if="booking.note" class="booking-card__note">{{ booking.note }}</p>
    <p v-if="booking.guestName === null" class="booking-card__erased">
      {{ t('booking.staff.erased') }}
    </p>
    <div v-if="waiting" class="booking-card__actions">
      <template v-if="booking.status === 'pending'">
        <BaseButton @click="$emit('confirm')">{{ t('booking.staff.actions.confirm') }}</BaseButton>
        <BaseButton variant="secondary" @click="$emit('seat')">
          {{ t('booking.staff.actions.seat') }}
        </BaseButton>
      </template>
      <template v-else>
        <BaseButton @click="$emit('seat')">{{ t('booking.staff.actions.seat') }}</BaseButton>
        <BaseButton variant="secondary" @click="$emit('move')">
          {{ t('booking.staff.actions.move') }}
        </BaseButton>
      </template>
      <BaseButton v-if="started" variant="secondary" @click="$emit('noShow')">
        {{ t('booking.staff.actions.noShow') }}
      </BaseButton>
      <BaseButton variant="ghost" @click="$emit('cancel')">
        {{ t('booking.staff.actions.cancel') }}
      </BaseButton>
    </div>
  </article>
</template>

<style scoped>
.booking-card {
  display: grid;
  align-content: start;
  gap: var(--space-2);
  block-size: 100%;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  background: var(--color-surface);
  box-shadow: var(--shadow-1);
}

.booking-card--late {
  border-color: var(--color-warning);
  border-inline-start-width: 6px;
}

.booking-card--closed {
  box-shadow: none;
}

.booking-card__head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  justify-content: space-between;
}

.booking-card__time {
  margin: 0;
  font-size: var(--font-size-title);
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
}

.booking-card__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.booking-card__name {
  margin: 0;
  font-size: var(--font-size-body);
}

.booking-card__facts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  margin: 0;
  padding: 0;
  color: var(--color-text-muted);
  list-style: none;
}

.booking-card__facts li {
  display: inline-flex;
  gap: var(--space-1);
  align-items: center;
}

.booking-card__phone {
  display: inline-flex;
  align-items: center;
  min-block-size: var(--target-min);
  font-weight: var(--font-weight-medium);
  color: var(--color-primary);
}

.booking-card__note {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-1);
  background: var(--color-surface-muted);
}

.booking-card__erased {
  margin: 0;
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
}

.booking-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding-block-start: var(--space-1);
}
</style>
