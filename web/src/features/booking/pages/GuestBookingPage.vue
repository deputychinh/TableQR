<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { CalendarOff, CircleHelp, Clock, Store } from 'lucide-vue-next';
import { ApiError } from '@/api/client';
import BaseButton from '@/components/BaseButton.vue';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import FormAlert from '@/components/FormAlert.vue';
import FormField from '@/components/FormField.vue';
import LoadingState from '@/components/LoadingState.vue';
import NumberStepper from '@/components/NumberStepper.vue';
import SelectField from '@/components/SelectField.vue';
import StatusChip from '@/components/StatusChip.vue';
import TextAreaField from '@/components/TextAreaField.vue';
import {
  BookingRefusal,
  createBooking,
  loadSlots,
  type GuestBooking,
  type SlotsView,
} from '../api';
import DateField from '../components/DateField.vue';
import {
  BOOK_AHEAD_DAYS,
  formatDay,
  isIsoDate,
  isVnMobile,
  restaurantToday,
  shiftDate,
} from '../time';

/** Public booking page `/r/:slug/dat-ban` (S14, AC48–AC50). */
type Page =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'not-found' }
  | { kind: 'suspended' }
  | { kind: 'error' }
  | { kind: 'done'; booking: GuestBooking };

const PARTY = { min: 1, max: 30 } as const;
const NAME = { min: 2, max: 60 } as const;
const NOTE_MAX = 140;
const REASONS = {
  past: true,
  too_far: true,
  closed_day: true,
  outside_hours: true,
  booking_disabled: true,
} as const;

const { t } = useI18n();
const route = useRoute();
const slug = computed(() => (typeof route.params.slug === 'string' ? route.params.slug : ''));

const today = restaurantToday();
const page = ref<Page>({ kind: 'loading' });
const slots = ref<SlotsView>();
const slotsBusy = ref(false);
const form = reactive({ date: today, time: '', partySize: 2, name: '', phone: '', note: '' });
const errors = reactive<Record<'date' | 'time' | 'name' | 'phone' | 'note', string | undefined>>({
  date: undefined,
  time: undefined,
  name: undefined,
  phone: undefined,
  note: undefined,
});
const alert = ref<string>();
const nearest = ref<string[]>([]);
const submitting = ref(false);
/** Kept across retries of one submission so a lost answer never books twice. */
let idempotencyKey = crypto.randomUUID();
let lastRequest = '';

const freeTimes = computed(() => slots.value?.times.filter((slot) => slot.free) ?? []);
const timeOptions = computed(() => [
  // No time chosen (the one picked is gone): the select asks for one instead of showing another.
  ...(form.time === '' ? [{ value: '', label: t('booking.guest.timePlaceholder') }] : []),
  ...freeTimes.value.map((slot) => ({ value: slot.time, label: slot.time })),
]);
const restaurantName = computed(() => slots.value?.restaurant.name ?? '');

const fetchSlots = async (first = false) => {
  if (!isIsoDate(form.date)) {
    errors.date = t('booking.guest.errors.date');
    return;
  }
  errors.date = undefined;
  slotsBusy.value = true;
  try {
    const view = await loadSlots(slug.value, form.date, form.partySize);
    slots.value = view;
    document.title = `${t('booking.guest.title')} · ${view.restaurant.name}`;
    const chosen = form.time;
    if (!view.times.some((slot) => slot.free && slot.time === chosen)) {
      if (chosen === '') {
        // Nothing chosen yet: offer the first free time.
        form.time = view.times.find((slot) => slot.free)?.time ?? '';
      } else {
        // TQR-020: never swap the guest's time silently; say it is gone and ask for a new one.
        form.time = '';
        errors.time = t('booking.guest.errors.timeGone', { time: chosen, n: form.partySize });
      }
    }
    if (first) page.value = { kind: 'ready' };
  } catch (error: unknown) {
    if (error instanceof ApiError && error.code === 'RESTAURANT_SUSPENDED') {
      page.value = { kind: 'suspended' };
    } else if (error instanceof ApiError && error.status === 404) {
      page.value = { kind: 'not-found' };
    } else if (first) {
      page.value = { kind: 'error' };
    } else {
      alert.value = t('booking.guest.loadError');
    }
  } finally {
    slotsBusy.value = false;
  }
};

const start = async () => {
  page.value = { kind: 'loading' };
  await fetchSlots(true);
};

onMounted(start);
watch(
  () => form.time,
  (time) => {
    if (time !== '') errors.time = undefined;
  },
);
watch(
  () => [form.date, form.partySize],
  () => {
    nearest.value = [];
    void fetchSlots();
  },
);

const validate = (): boolean => {
  const name = form.name.trim().replace(/\s+/gu, ' ');
  const nameLength = Array.from(name).length;
  errors.name =
    nameLength < NAME.min || nameLength > NAME.max ? t('booking.guest.errors.name') : undefined;
  errors.phone = isVnMobile(form.phone) ? undefined : t('booking.guest.errors.phone');
  errors.note =
    Array.from(form.note.trim()).length > NOTE_MAX ? t('booking.guest.errors.note') : undefined;
  errors.time = form.time === '' ? t('booking.guest.errors.time') : undefined;
  return !errors.name && !errors.phone && !errors.note && !errors.time && !errors.date;
};

const focusFirstInvalid = async () => {
  await nextTick();
  document.querySelector<HTMLElement>('.guest-booking__form [aria-invalid="true"]')?.focus();
};

const fieldOf = (path: string): keyof typeof errors | undefined =>
  ({ name: 'name', phone: 'phone', note: 'note', time: 'time', date: 'date' })[path] as
    keyof typeof errors | undefined;

const explain = async (error: unknown) => {
  if (!(error instanceof ApiError)) {
    alert.value = t('booking.guest.errors.unexpected');
    return;
  }
  if (error.code === 'NETWORK') {
    // Same key on the next tap: if the first request did arrive, the API returns that booking.
    alert.value = t('booking.guest.errors.network');
    return;
  }
  idempotencyKey = crypto.randomUUID();
  if (error.code === 'NO_TABLE_FREE') {
    alert.value = t('booking.guest.errors.noTableFree', { n: form.partySize });
    nearest.value =
      error instanceof BookingRefusal
        ? error.nearest.filter((slot) => slot.date === form.date).map((slot) => slot.time)
        : [];
    if (nearest.value.length === 0) alert.value += ` ${t('booking.guest.errors.noNearest')}`;
    await fetchSlots();
  } else if (error.code === 'BOOKING_NOT_ALLOWED') {
    const reason = error instanceof BookingRefusal ? error.reason : undefined;
    alert.value = t(
      reason && reason in REASONS
        ? `booking.guest.errors.reasons.${reason}`
        : 'booking.guest.errors.unexpected',
    );
    await fetchSlots();
  } else if (error.code === 'TOO_MANY_BOOKINGS') {
    alert.value = t('booking.guest.errors.tooMany');
  } else if (error.code === 'TOO_MANY_REQUESTS') {
    alert.value = t('booking.guest.errors.tooManyRequests');
  } else if (error.code === 'RESTAURANT_SUSPENDED') {
    page.value = { kind: 'suspended' };
  } else if (error.code === 'VALIDATION_FAILED' && error.fields.length > 0) {
    for (const field of error.fields) {
      const key = fieldOf(field.path);
      if (key) errors[key] = t(`booking.guest.errors.${key}`);
    }
    await focusFirstInvalid();
  } else {
    alert.value = t('booking.guest.errors.unexpected');
  }
};

const submit = async () => {
  alert.value = undefined;
  nearest.value = [];
  if (!validate()) {
    await focusFirstInvalid();
    return;
  }
  submitting.value = true;
  const request = {
    date: form.date,
    time: form.time,
    partySize: form.partySize,
    name: form.name,
    phone: form.phone,
    ...(form.note.trim() === '' ? {} : { note: form.note }),
  };
  // A retry reuses the key only for the very same request; a changed form is a new booking.
  const fingerprint = JSON.stringify(request);
  if (fingerprint !== lastRequest) idempotencyKey = crypto.randomUUID();
  lastRequest = fingerprint;
  try {
    const booking = await createBooking(slug.value, request, idempotencyKey);
    idempotencyKey = crypto.randomUUID();
    page.value = { kind: 'done', booking };
  } catch (error: unknown) {
    await explain(error);
  } finally {
    submitting.value = false;
  }
};

const pick = (time: string) => {
  form.time = time;
  nearest.value = [];
  alert.value = undefined;
};

const again = async () => {
  form.note = '';
  alert.value = undefined;
  page.value = { kind: 'ready' };
  await fetchSlots();
};
</script>

<template>
  <div class="guest-booking">
    <header v-if="restaurantName" class="guest-booking__bar">
      <Store :size="20" aria-hidden="true" />
      <span class="guest-booking__restaurant">{{ restaurantName }}</span>
    </header>
    <main class="guest-booking__main">
      <LoadingState v-if="page.kind === 'loading'" :label="t('booking.guest.loading')" :rows="4" />
      <EmptyState
        v-else-if="page.kind === 'not-found'"
        :heading-level="1"
        :title="t('booking.guest.notFoundTitle')"
        :body="t('booking.guest.notFoundBody')"
      >
        <template #icon><CircleHelp :size="32" /></template>
      </EmptyState>
      <EmptyState
        v-else-if="page.kind === 'suspended'"
        :heading-level="1"
        :title="t('booking.guest.suspendedTitle')"
        :body="t('booking.guest.suspendedBody')"
      >
        <template #icon><Store :size="32" /></template>
      </EmptyState>
      <ErrorState
        v-else-if="page.kind === 'error'"
        :message="t('booking.guest.loadError')"
        :retry-label="t('booking.guest.retry')"
        @retry="start"
      />
      <EmptyState
        v-else-if="slots && !slots.enabled"
        :heading-level="1"
        :title="t('booking.guest.disabledTitle')"
        :body="t('booking.guest.disabledBody')"
      >
        <template #icon><CalendarOff :size="32" /></template>
      </EmptyState>
      <section
        v-else-if="page.kind === 'done'"
        class="guest-booking__done"
        aria-labelledby="booking-done-title"
      >
        <h1 id="booking-done-title" class="guest-booking__title">
          {{ t('booking.guest.done.title') }}
        </h1>
        <StatusChip :label="t('booking.status.pending')" tone="warning" :icon="Clock" />
        <dl class="guest-booking__summary">
          <div>
            <dt>{{ t('booking.guest.done.when') }}</dt>
            <dd>{{ page.booking.time }} · {{ formatDay(page.booking.date) }}</dd>
          </div>
          <div>
            <dt>{{ t('booking.guest.done.party') }}</dt>
            <dd>{{ t('booking.guest.done.partyValue', { n: page.booking.partySize }) }}</dd>
          </div>
        </dl>
        <p class="guest-booking__lead">{{ t('booking.guest.done.body') }}</p>
        <BaseButton variant="secondary" block @click="again">
          {{ t('booking.guest.done.again') }}
        </BaseButton>
      </section>
      <form v-else class="guest-booking__form" novalidate @submit.prevent="submit">
        <h1 class="guest-booking__title">
          {{ t('booking.guest.heading', { restaurant: restaurantName }) }}
        </h1>
        <p class="guest-booking__lead">{{ t('booking.guest.lead') }}</p>

        <DateField
          v-model="form.date"
          :label="t('booking.guest.date')"
          :min="today"
          :max="shiftDate(today, BOOK_AHEAD_DAYS)"
          :hint="isIsoDate(form.date) ? formatDay(form.date) : undefined"
          :error="errors.date"
        />
        <NumberStepper
          v-model="form.partySize"
          :label="t('booking.guest.party')"
          :min="PARTY.min"
          :max="PARTY.max"
          :step="1"
          :unit="t('booking.guest.partyUnit')"
          :decrease-label="t('booking.guest.partyDecrease')"
          :increase-label="t('booking.guest.partyIncrease')"
        />
        <p v-if="slotsBusy" class="guest-booking__hint" role="status">
          {{ t('booking.guest.timesLoading') }}
        </p>
        <SelectField
          v-else-if="freeTimes.length > 0"
          v-model="form.time"
          :label="t('booking.guest.time')"
          :options="timeOptions"
          :hint="t('booking.guest.timeHint', { minutes: slots?.slotMinutes ?? 0 })"
          :error="errors.time"
        />
        <p v-else class="guest-booking__none" role="status">
          {{ t('booking.guest.noTimes', { n: form.partySize }) }}
        </p>

        <FormField
          v-model="form.name"
          :label="t('booking.guest.name')"
          autocomplete="name"
          required
          :error="errors.name"
        />
        <FormField
          v-model="form.phone"
          :label="t('booking.guest.phone')"
          autocomplete="tel"
          inputmode="numeric"
          required
          :hint="t('booking.guest.phoneHint')"
          :error="errors.phone"
        />
        <TextAreaField
          v-model="form.note"
          :label="t('booking.guest.note')"
          :hint="t('booking.guest.noteHint')"
          :maxlength="NOTE_MAX"
          :rows="2"
          :error="errors.note"
        />

        <div v-if="alert" class="guest-booking__alert">
          <FormAlert :message="alert" />
          <template v-if="nearest.length > 0">
            <p class="guest-booking__hint">{{ t('booking.guest.errors.nearest') }}</p>
            <div class="guest-booking__nearest">
              <BaseButton
                v-for="time in nearest"
                :key="time"
                variant="secondary"
                @click="pick(time)"
              >
                {{ t('booking.guest.errors.pickTime', { time }) }}
              </BaseButton>
            </div>
          </template>
        </div>

        <BaseButton
          type="submit"
          size="lg"
          block
          :loading="submitting"
          :disabled="freeTimes.length === 0"
        >
          {{ t('booking.guest.submit') }}
        </BaseButton>
        <p class="guest-booking__hint">{{ t('booking.guest.privacy') }}</p>
      </form>
    </main>
  </div>
</template>

<style scoped>
.guest-booking {
  min-block-size: 100dvh;
  background: var(--color-bg);
}

.guest-booking__bar {
  position: sticky;
  inset-block-start: 0;
  z-index: var(--z-header);
  display: flex;
  gap: var(--space-2);
  align-items: center;
  min-block-size: var(--target-large);
  padding: var(--space-2) var(--space-3);
  border-block-end: 1px solid var(--color-border);
  color: var(--color-primary);
  background: var(--color-surface);
}

.guest-booking__restaurant {
  overflow: hidden;
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.guest-booking__main {
  max-inline-size: var(--measure-form);
  margin-inline: auto;
  padding: var(--space-4) var(--space-3) var(--space-5);
}

.guest-booking__form,
.guest-booking__done {
  display: grid;
  gap: var(--space-4);
}

.guest-booking__done {
  justify-items: start;
}

.guest-booking__title {
  margin: 0;
  font-size: var(--font-size-title);
}

.guest-booking__lead {
  margin: calc(-1 * var(--space-2)) 0 0;
  color: var(--color-text-muted);
}

.guest-booking__done .guest-booking__lead {
  margin: 0;
}

.guest-booking__hint {
  margin: 0;
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
}

.guest-booking__none {
  margin: 0;
  padding: var(--space-3);
  border-radius: var(--radius-1);
  background: var(--color-warning-bg);
}

.guest-booking__alert {
  display: grid;
  gap: var(--space-2);
}

.guest-booking__nearest {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.guest-booking__summary {
  display: grid;
  gap: var(--space-2);
  inline-size: 100%;
  margin: 0;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2);
  background: var(--color-surface);
}

.guest-booking__summary div {
  display: flex;
  gap: var(--space-3);
  justify-content: space-between;
}

.guest-booking__summary dt {
  color: var(--color-text-muted);
}

.guest-booking__summary dd {
  margin: 0;
  font-weight: var(--font-weight-bold);
  text-align: end;
}
</style>
