<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseButton from '@/components/BaseButton.vue';
import BaseSheet from '@/components/BaseSheet.vue';
import FormAlert from '@/components/FormAlert.vue';
import SelectField from '@/components/SelectField.vue';
import type { Booking, TableOption } from '../api';

/**
 * Confirm a booking or move it to another table (AC51). Only tables with enough seats are offered;
 * an overlap is still refused by the server (TABLE_BUSY) and shown here.
 */
const props = defineProps<{
  open: boolean;
  mode: 'confirm' | 'move';
  booking: Booking | undefined;
  tables: TableOption[];
  busy: boolean;
  error: string | undefined;
}>();
const emit = defineEmits<{ submit: [tableId: string]; close: [] }>();
const { t } = useI18n();

const tableId = ref('');
const fitting = computed(() =>
  props.tables
    .filter((table) => table.seats >= (props.booking?.partySize ?? 1))
    .map((table) => ({
      value: table.id,
      label: t('booking.staff.tableSheet.option', { name: table.name, seats: table.seats }),
    })),
);

watch(
  () => [props.open, props.booking?.id],
  () => {
    tableId.value = props.booking?.tableId ?? fitting.value[0]?.value ?? '';
  },
  { immediate: true },
);

const title = computed(() =>
  props.booking
    ? t(`booking.staff.tableSheet.${props.mode}Title`, {
        name: props.booking.guestName ?? t('booking.staff.guest'),
      })
    : '',
);
</script>

<template>
  <BaseSheet :open="open" :title="title" @close="emit('close')">
    <form
      v-if="booking"
      :id="`table-choice-${booking.id}`"
      class="table-choice"
      @submit.prevent="emit('submit', tableId)"
    >
      <SelectField
        v-if="fitting.length > 0"
        v-model="tableId"
        :label="t('booking.staff.tableSheet.label')"
        :options="fitting"
        :hint="t('booking.staff.tableSheet.hint', { n: booking.partySize })"
      />
      <p v-else class="table-choice__none">
        {{ t('booking.staff.tableSheet.noTables', { n: booking.partySize }) }}
      </p>
      <FormAlert v-if="error" :message="error" />
    </form>
    <template #actions>
      <BaseButton variant="secondary" :disabled="busy" @click="emit('close')">
        {{ t('booking.staff.tableSheet.close') }}
      </BaseButton>
      <BaseButton
        type="submit"
        :form="booking ? `table-choice-${booking.id}` : undefined"
        :loading="busy"
        :disabled="tableId === ''"
      >
        {{ t('booking.staff.tableSheet.submit') }}
      </BaseButton>
    </template>
  </BaseSheet>
</template>

<style scoped>
.table-choice {
  display: grid;
  gap: var(--space-3);
}

.table-choice__none {
  margin: 0;
  color: var(--color-text-muted);
}
</style>
