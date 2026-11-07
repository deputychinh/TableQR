<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Banknote, CircleCheck, Clock, Landmark, ReceiptText, RefreshCw, X } from 'lucide-vue-next';
import BaseButton from '@/components/BaseButton.vue';
import StatusChip from '@/components/StatusChip.vue';
import { formatVnd } from '@/features/menu/price';
import type { CashierSession, PaymentMethod } from '../api';
import { shortDateTime } from '../bill-state';

/** One table on the cashier screen: what it owes, its bill code and the next action (S13). */
const props = defineProps<{ session: CashierSession; transferEnabled: boolean }>();
const emit = defineEmits<{
  bill: [session: CashierSession];
  pay: [session: CashierSession, method: PaymentMethod];
  close: [session: CashierSession];
}>();
const { t } = useI18n();

const bill = computed(() => props.session.bill);
const openBill = computed(() => (bill.value?.status === 'open' ? bill.value : null));
const settled = computed(() => props.session.dueVnd === 0 && props.session.totalVnd > 0);
/** A bill is needed (none yet, or the table ordered more since the code was issued). */
const needsBill = computed(
  () => props.session.dueVnd > 0 && openBill.value?.amountVnd !== props.session.dueVnd,
);
const chip = computed(() => {
  if (settled.value) return { tone: 'success' as const, icon: CircleCheck, key: 'paid' };
  if (openBill.value && !needsBill.value)
    return { tone: 'warning' as const, icon: Clock, key: 'open' };
  if (openBill.value) return { tone: 'danger' as const, icon: RefreshCw, key: 'superseded' };
  return { tone: 'neutral' as const, icon: ReceiptText, key: 'none' };
});
</script>

<template>
  <li class="cashier-session-card">
    <div class="cashier-session-card__head">
      <h2 class="cashier-session-card__table">{{ session.tableName }}</h2>
      <StatusChip :tone="chip.tone" :icon="chip.icon" :label="t(`billing.status.${chip.key}`)" />
    </div>
    <p class="cashier-session-card__meta">
      {{ t('billing.cashier.party', { n: session.partySize }) }} ·
      {{ t('billing.cashier.openedAt', { at: shortDateTime(session.openedAt) }) }}
    </p>

    <dl class="cashier-session-card__money">
      <div>
        <dt>{{ t('billing.cashier.total') }}</dt>
        <dd>{{ formatVnd(session.totalVnd) }}</dd>
      </div>
      <div>
        <dt>{{ t('billing.cashier.due') }}</dt>
        <dd class="cashier-session-card__due">{{ formatVnd(session.dueVnd) }}</dd>
      </div>
    </dl>

    <p v-if="openBill" class="cashier-session-card__code">
      {{ t('billing.cashier.code', { code: openBill.code }) }}
      <span v-if="needsBill" class="cashier-session-card__stale">
        · {{ formatVnd(openBill.amountVnd) }}
      </span>
    </p>
    <p v-else-if="bill?.status === 'paid' && bill.method" class="cashier-session-card__paid">
      {{
        t('billing.cashier.paidBy', {
          method: t(`billing.method.${bill.method}`),
          who: bill.paidByName ?? '—',
          at: shortDateTime(bill.paidAt),
        })
      }}
    </p>

    <div class="cashier-session-card__actions">
      <BaseButton v-if="needsBill" variant="secondary" size="lg" @click="emit('bill', session)">
        <ReceiptText :size="20" aria-hidden="true" />
        {{ t('billing.cashier.makeBill') }}
      </BaseButton>
      <template v-if="openBill && !needsBill">
        <BaseButton
          v-if="transferEnabled"
          size="lg"
          :aria-label="`${t('billing.cashier.receivedTransfer')} – ${session.tableName}`"
          @click="emit('pay', session, 'transfer')"
        >
          <Landmark :size="20" aria-hidden="true" />
          {{ t('billing.cashier.receivedTransfer') }}
        </BaseButton>
        <BaseButton
          :variant="transferEnabled ? 'secondary' : 'primary'"
          size="lg"
          :aria-label="`${t('billing.cashier.receivedCash')} – ${session.tableName}`"
          @click="emit('pay', session, 'cash')"
        >
          <Banknote :size="20" aria-hidden="true" />
          {{ t('billing.cashier.receivedCash') }}
        </BaseButton>
      </template>
      <BaseButton
        :variant="settled || session.totalVnd === 0 ? 'primary' : 'ghost'"
        size="lg"
        :aria-label="`${t('billing.cashier.close')} – ${session.tableName}`"
        @click="emit('close', session)"
      >
        <X :size="20" aria-hidden="true" />
        {{ t('billing.cashier.close') }}
      </BaseButton>
    </div>
  </li>
</template>

<style scoped>
.cashier-session-card {
  display: grid;
  gap: var(--space-2);
  align-content: start;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  background: var(--color-surface);
}

.cashier-session-card__head {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  justify-content: space-between;
}

.cashier-session-card__table {
  margin: 0;
  font-size: var(--font-size-lead);
}

.cashier-session-card__meta,
.cashier-session-card__paid {
  margin: 0;
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
}

.cashier-session-card__money {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
  margin: 0;
}

.cashier-session-card__money dt {
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
}

.cashier-session-card__money dd {
  margin: 0;
  font-weight: var(--font-weight-medium);
  font-variant-numeric: tabular-nums;
}

.cashier-session-card__due {
  font-size: var(--font-size-title);
  font-weight: var(--font-weight-bold);
}

.cashier-session-card__code {
  margin: 0;
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.04em;
}

.cashier-session-card__stale {
  font-weight: var(--font-weight-medium);
  color: var(--color-text-muted);
  text-decoration: line-through;
}

.cashier-session-card__actions {
  display: grid;
  gap: var(--space-2);
  margin-block-start: var(--space-1);
}
</style>
