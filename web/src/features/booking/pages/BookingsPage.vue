<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { CalendarDays, ChevronLeft, ChevronRight, Copy, Link } from 'lucide-vue-next';
import { ApiError } from '@/api/client';
import OwnerShell from '@/app/layouts/OwnerShell.vue';
import StaffShell from '@/app/layouts/StaffShell.vue';
import BaseButton from '@/components/BaseButton.vue';
import ConfirmSheet from '@/components/ConfirmSheet.vue';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import FormAlert from '@/components/FormAlert.vue';
import LoadingState from '@/components/LoadingState.vue';
import { useStream } from '@/composables/useStream';
import { useSessionStore } from '@/stores/session';
import {
  bookingAction,
  listBookings,
  listTableOptions,
  type Booking,
  type TableOption,
} from '../api';
import BookingCard from '../components/BookingCard.vue';
import DateField from '../components/DateField.vue';
import TableChoiceSheet from '../components/TableChoiceSheet.vue';
import { formatDay, isIsoDate, restaurantToday, shiftDate } from '../time';

/** Staff booking list `/dat-ban` (S15, AC51–AC53): owner, cashier and waiter. */
type Confirming = { kind: 'seat' | 'cancel' | 'noShow'; booking: Booking };

const TICK_MS = 30_000;

const { t } = useI18n();
const session = useSessionStore();
const isOwner = computed(() => session.me?.user.role === 'owner');
const shareUrl = computed(
  () => `${window.location.origin}/r/${session.me?.restaurant?.slug ?? ''}/dat-ban`,
);

const date = ref(restaurantToday());
const items = ref<Booking[]>([]);
const status = ref<'loading' | 'ready' | 'error'>('loading');
const notice = ref('');
const actionError = ref<string>();
const now = ref(Date.now());

const tables = ref<TableOption[]>([]);
const sheet = ref<{ mode: 'confirm' | 'move'; booking: Booking }>();
const sheetError = ref<string>();
const sheetBusy = ref(false);
const confirming = ref<Confirming>();
const confirmBusy = ref(false);

const load = async (quiet = false) => {
  if (!isIsoDate(date.value)) return;
  if (!quiet) status.value = 'loading';
  try {
    const day = await listBookings(date.value);
    items.value = day.items;
    status.value = 'ready';
  } catch {
    // ErrorState offers a retry; a quiet refresh keeps the list already shown.
    if (!quiet) status.value = 'error';
  }
};

const setDate = (next: string) => {
  date.value = next;
  void load();
};

let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  void load();
  timer = setInterval(() => (now.value = Date.now()), TICK_MS);
});
onUnmounted(() => clearInterval(timer));

// Another device confirmed, seated or a guest booked: refresh from the server (ADR 0004).
if (typeof EventSource !== 'undefined') {
  useStream<unknown>('/api/stream/floor', {
    onSnapshot: () => void load(true),
    onDelta: (delta) => {
      if (delta.type === 'booking.status') void load(true);
    },
  });
}

const replace = (booking: Booking) => {
  items.value = items.value.map((item) => (item.id === booking.id ? booking : item));
};

const nameOf = (booking: Booking) => booking.guestName ?? t('booking.staff.guest');

const describe = async (error: unknown, booking: Booking): Promise<string> => {
  if (!(error instanceof ApiError)) return t('booking.staff.errors.unexpected');
  if (error.code === 'NETWORK') return t('booking.staff.errors.network');
  if (error.code === 'TABLE_HAS_OPEN_SESSION') {
    return t('booking.staff.errors.openSession', { table: booking.tableName });
  }
  if (error.code === 'TOO_EARLY_FOR_NO_SHOW') return t('booking.staff.errors.tooEarly');
  if (error.code === 'BOOKING_WRONG_STATUS' || error.code === 'NOT_FOUND') {
    await load(true);
    return t('booking.staff.errors.changed');
  }
  return t('booking.staff.errors.unexpected');
};

const openSheet = async (mode: 'confirm' | 'move', booking: Booking) => {
  sheetError.value = undefined;
  sheet.value = { mode, booking };
  try {
    tables.value = await listTableOptions();
  } catch {
    sheetError.value = t('booking.staff.tableSheet.loadError');
  }
};

const submitTable = async (tableId: string) => {
  const current = sheet.value;
  if (!current) return;
  sheetBusy.value = true;
  sheetError.value = undefined;
  try {
    const updated = await bookingAction(current.booking.id, 'confirm', { tableId });
    replace(updated);
    sheet.value = undefined;
    notice.value =
      current.mode === 'move'
        ? t('booking.staff.done.move', { name: nameOf(updated), table: updated.tableName })
        : t('booking.staff.done.confirm', { name: nameOf(updated) });
  } catch (error: unknown) {
    if (error instanceof ApiError && error.code === 'TABLE_BUSY') {
      sheetError.value = t('booking.staff.tableSheet.busy');
    } else if (error instanceof ApiError && error.code === 'TABLE_TOO_SMALL') {
      sheetError.value = t('booking.staff.tableSheet.tooSmall');
    } else {
      sheetError.value = await describe(error, current.booking);
    }
  } finally {
    sheetBusy.value = false;
  }
};

const ACTIONS = { seat: 'seat', cancel: 'cancel', noShow: 'no-show' } as const;

const confirmAction = async () => {
  const pending = confirming.value;
  if (!pending) return;
  confirmBusy.value = true;
  actionError.value = undefined;
  try {
    const updated = await bookingAction(pending.booking.id, ACTIONS[pending.kind]);
    replace(updated);
    notice.value = t(`booking.staff.done.${pending.kind}`, {
      name: nameOf(updated),
      table: updated.tableName,
    });
  } catch (error: unknown) {
    actionError.value = await describe(error, pending.booking);
  } finally {
    confirmBusy.value = false;
    confirming.value = undefined;
  }
};

const copyLink = async () => {
  try {
    await navigator.clipboard.writeText(shareUrl.value);
    notice.value = t('booking.staff.share.copied');
  } catch {
    actionError.value = t('booking.staff.share.copyFailed');
  }
};

const shell = computed(() => (isOwner.value ? OwnerShell : StaffShell));
</script>

<template>
  <component :is="shell" :title="t('booking.staff.title')">
    <div class="bookings-page">
      <header class="bookings-page__header">
        <h1 class="bookings-page__title">{{ t('booking.staff.title') }}</h1>
        <p class="bookings-page__lead">{{ t('booking.staff.lead') }}</p>
      </header>

      <section v-if="isOwner" class="bookings-page__share" aria-labelledby="booking-share-title">
        <h2 id="booking-share-title" class="bookings-page__share-title">
          <Link :size="20" aria-hidden="true" />
          {{ t('booking.staff.share.title') }}
        </h2>
        <p class="bookings-page__share-body">{{ t('booking.staff.share.body') }}</p>
        <div class="bookings-page__share-row">
          <input
            class="bookings-page__share-url"
            :value="shareUrl"
            readonly
            :aria-label="t('booking.staff.share.label')"
            @focus="($event.target as HTMLInputElement).select()"
          />
          <BaseButton variant="secondary" @click="copyLink">
            <Copy :size="20" aria-hidden="true" />
            {{ t('booking.staff.share.copy') }}
          </BaseButton>
        </div>
      </section>

      <div class="bookings-page__day">
        <BaseButton
          class="bookings-page__step"
          variant="secondary"
          :aria-label="t('booking.staff.previousDay')"
          @click="setDate(shiftDate(date, -1))"
        >
          <ChevronLeft :size="20" aria-hidden="true" />
        </BaseButton>
        <DateField
          v-model="date"
          class="bookings-page__date"
          :label="t('booking.staff.day')"
          @update:model-value="load()"
        />
        <BaseButton
          class="bookings-page__step"
          variant="secondary"
          :aria-label="t('booking.staff.nextDay')"
          @click="setDate(shiftDate(date, 1))"
        >
          <ChevronRight :size="20" aria-hidden="true" />
        </BaseButton>
      </div>
      <div class="bookings-page__dayline">
        <p class="bookings-page__count">
          {{ isIsoDate(date) ? formatDay(date) : '' }}
          <template v-if="status === 'ready' && items.length > 0">
            · {{ t('booking.staff.count', { n: items.length }) }}
          </template>
        </p>
        <BaseButton
          v-if="date !== restaurantToday()"
          variant="ghost"
          @click="setDate(restaurantToday())"
        >
          {{ t('booking.staff.today') }}
        </BaseButton>
      </div>

      <p class="bookings-page__notice" role="status" aria-live="polite">{{ notice }}</p>
      <FormAlert v-if="actionError" :message="actionError" />

      <LoadingState v-if="status === 'loading'" :label="t('booking.staff.loading')" />
      <ErrorState
        v-else-if="status === 'error'"
        :message="t('booking.staff.loadError')"
        :retry-label="t('booking.staff.retry')"
        @retry="load()"
      />
      <EmptyState
        v-else-if="items.length === 0"
        :title="t('booking.staff.emptyTitle')"
        :body="t('booking.staff.emptyBody')"
      >
        <template #icon><CalendarDays :size="32" /></template>
      </EmptyState>
      <template v-else>
        <ul
          class="bookings-page__list"
          :aria-label="t('booking.staff.listLabel', { date: formatDay(date) })"
        >
          <li v-for="booking in items" :key="booking.id">
            <BookingCard
              :booking="booking"
              :now="now"
              @confirm="openSheet('confirm', booking)"
              @move="openSheet('move', booking)"
              @seat="confirming = { kind: 'seat', booking }"
              @cancel="confirming = { kind: 'cancel', booking }"
              @no-show="confirming = { kind: 'noShow', booking }"
            />
          </li>
        </ul>
      </template>
    </div>

    <TableChoiceSheet
      :open="sheet !== undefined"
      :mode="sheet?.mode ?? 'confirm'"
      :booking="sheet?.booking"
      :tables="tables"
      :busy="sheetBusy"
      :error="sheetError"
      @submit="submitTable"
      @close="sheet = undefined"
    />
    <ConfirmSheet
      :open="confirming !== undefined"
      :title="
        confirming
          ? t(`booking.staff.${confirming.kind}.title`, { name: nameOf(confirming.booking) })
          : ''
      "
      :confirm-label="confirming ? t(`booking.staff.${confirming.kind}.confirm`) : ''"
      :cancel-label="t('booking.staff.keep')"
      :busy="confirmBusy"
      :variant="confirming?.kind === 'seat' ? 'primary' : 'danger'"
      @confirm="confirmAction"
      @cancel="confirming = undefined"
    >
      <p v-if="confirming">
        {{
          t(`booking.staff.${confirming.kind}.body`, {
            table: confirming.booking.tableName,
            n: confirming.booking.partySize,
          })
        }}
      </p>
    </ConfirmSheet>
  </component>
</template>

<style scoped>
.bookings-page {
  display: grid;
  gap: var(--space-3);
}

.bookings-page__title {
  margin: 0;
  font-size: var(--font-size-title);
}

.bookings-page__lead {
  margin: var(--space-1) 0 0;
  color: var(--color-text-muted);
}

.bookings-page__share {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  background: var(--color-surface);
}

.bookings-page__share-title {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  margin: 0;
  font-size: var(--font-size-body);
}

.bookings-page__share-body {
  margin: 0;
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
}

.bookings-page__share-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.bookings-page__share-url {
  flex: 1 1 14rem;
  min-inline-size: 0;
  min-block-size: var(--target-min);
  padding-inline: var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-1);
  font: inherit;
  color: var(--color-text);
  background: var(--color-surface-muted);
}

.bookings-page__day {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: var(--space-2);
  align-items: end;
  max-inline-size: 32rem;
}

.bookings-page__step {
  inline-size: var(--target-large);
  padding-inline: 0;
}

.bookings-page__dayline {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  justify-content: space-between;
  min-block-size: var(--target-min);
}

.bookings-page__notice {
  margin: 0;
  padding: var(--space-3);
  border-radius: var(--radius-1);
  background: var(--color-success-bg);
}

.bookings-page__notice:empty {
  display: none;
}

.bookings-page__count {
  margin: 0;
  color: var(--color-text-muted);
}

.bookings-page__list {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

@media (width >= 840px) {
  .bookings-page__list {
    grid-template-columns: repeat(auto-fill, minmax(24rem, 1fr));
  }
}
</style>
