<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Info, ReceiptText, TriangleAlert } from 'lucide-vue-next';
import { ApiError } from '@/api/client';
import RoleShell from '@/app/layouts/RoleShell.vue';
import ConfirmSheet from '@/components/ConfirmSheet.vue';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import FormAlert from '@/components/FormAlert.vue';
import LoadingState from '@/components/LoadingState.vue';
import TextAreaField from '@/components/TextAreaField.vue';
import { staffStream } from '@/composables/staff-stream';
import { useStream } from '@/composables/useStream';
import { formatVnd } from '@/features/menu/price';
import { useToastStore } from '@/stores/toast';
import CashierSessionCard from '../components/CashierSessionCard.vue';
import {
  FLOOR_STREAM,
  closeSession,
  getCashierOverview,
  payBill,
  requestStaffBill,
  type CashierOverview,
  type CashierSession,
  type PaymentMethod,
} from '../api';
import { shortDateTime } from '../bill-state';

/** `/thu-ngan` (S13): open tables, bills, payment confirmation and closing — live from the floor. */
const CLOSE_REASON_MAX = 200;

const { t } = useI18n();
const overview = ref<CashierOverview>();
const loadFailed = ref(false);
const toast = useToastStore();
const paying = ref<{ session: CashierSession; method: PaymentMethod }>();
const closing = ref<CashierSession>();
const reason = ref('');
const reasonError = ref<string>();
const busy = ref(false);
const actionError = ref<string>();

const load = async () => {
  try {
    overview.value = await getCashierOverview();
    loadFailed.value = false;
  } catch {
    loadFailed.value = true;
  }
};

let pendingReload: ReturnType<typeof setTimeout> | undefined;
/** Many deltas arrive together (an order releases several dishes): reload once. */
const reloadSoon = () => {
  clearTimeout(pendingReload);
  pendingReload = setTimeout(() => void load(), 150);
};

useStream(FLOOR_STREAM, { onSnapshot: reloadSoon, onDelta: reloadSoon }, staffStream);
onMounted(load);

const describe = (error: unknown): string => {
  const code = error instanceof ApiError ? error.code : '';
  if (code === 'ALREADY_PAID') return t('billing.cashier.errors.alreadyPaid');
  if (code === 'BILL_SUPERSEDED') return t('billing.cashier.errors.superseded');
  if (code === 'SESSION_CLOSED') return t('billing.cashier.errors.sessionClosed');
  return t('billing.cashier.errors.generic');
};

const makeBill = async (session: CashierSession) => {
  actionError.value = undefined;
  try {
    const view = await requestStaffBill(session.sessionId);
    if (view.bill?.status === 'open') {
      toast.show(
        t('billing.cashier.billReady', {
          table: session.tableName,
          amount: formatVnd(view.bill.amountVnd),
          code: view.bill.code,
        }),
      );
    }
  } catch (error: unknown) {
    actionError.value = describe(error);
  }
  await load();
};

const askPay = (session: CashierSession, method: PaymentMethod) => {
  actionError.value = undefined;
  paying.value = { session, method };
};

const confirmPay = async () => {
  const target = paying.value;
  const bill = target?.session.bill;
  if (!target || !bill) return;
  busy.value = true;
  actionError.value = undefined;
  try {
    await payBill(bill.id, target.method);
    toast.show(
      t('billing.cashier.paid', {
        amount: formatVnd(bill.amountVnd),
        table: target.session.tableName,
      }),
    );
    paying.value = undefined;
  } catch (error: unknown) {
    actionError.value = describe(error);
    // 409: someone else confirmed, the bill changed or the table closed. The sheet's amount and
    // code are stale, so it closes and the list shows the current state with the reason above.
    if (error instanceof ApiError && error.status === 409) paying.value = undefined;
  } finally {
    busy.value = false;
  }
  await load();
};

const askClose = (session: CashierSession) => {
  actionError.value = undefined;
  reasonError.value = undefined;
  reason.value = '';
  closing.value = session;
};

const confirmClose = async () => {
  const target = closing.value;
  if (!target) return;
  const text = reason.value.trim();
  if (target.dueVnd > 0 && text === '') {
    reasonError.value = t('billing.cashier.closeReasonRequired');
    return;
  }
  busy.value = true;
  actionError.value = undefined;
  try {
    await closeSession(target.sessionId, target.dueVnd > 0 ? text : undefined);
    toast.show(t('billing.cashier.closed', { table: target.tableName }));
    closing.value = undefined;
  } catch (error: unknown) {
    if (error instanceof ApiError && error.code === 'CLOSE_REASON_REQUIRED') {
      reasonError.value = t('billing.cashier.closeReasonRequired');
    } else {
      actionError.value = describe(error);
    }
  } finally {
    busy.value = false;
  }
  await load();
};

const payBillOf = computed(() => paying.value?.session.bill);
</script>

<template>
  <RoleShell :title="t('billing.cashier.title')">
    <div class="cashier-page">
      <h1 class="cashier-page__title">{{ t('billing.cashier.heading') }}</h1>
      <p class="cashier-page__lead">
        {{
          overview?.qrEnabled === false
            ? t('billing.cashier.leadCounter')
            : t('billing.cashier.lead')
        }}
      </p>

      <p
        v-if="overview?.qrEnabled && overview.bankChangedRecently"
        class="cashier-page__banner cashier-page__banner--warning"
        role="alert"
      >
        <TriangleAlert :size="22" aria-hidden="true" />
        {{ t('billing.cashier.bankChanged', { at: shortDateTime(overview.bankChangedAt) }) }}
      </p>
      <p v-else-if="overview && !overview.qrEnabled" class="cashier-page__banner">
        <Info :size="22" aria-hidden="true" />
        {{ t('billing.cashier.noQr') }}
      </p>

      <FormAlert v-if="actionError && !paying && !closing" :message="actionError" />

      <LoadingState v-if="!overview && !loadFailed" :label="t('billing.cashier.loading')" />
      <ErrorState
        v-else-if="!overview"
        :message="t('billing.cashier.loadError')"
        :retry-label="t('billing.cashier.retry')"
        @retry="load"
      />
      <EmptyState
        v-else-if="overview.sessions.length === 0"
        :title="t('billing.cashier.emptyTitle')"
        :body="t('billing.cashier.emptyBody')"
      >
        <template #icon><ReceiptText :size="32" /></template>
      </EmptyState>
      <ul v-else class="cashier-page__list">
        <CashierSessionCard
          v-for="session in overview.sessions"
          :key="session.sessionId"
          :session="session"
          :transfer-enabled="overview.qrEnabled"
          @bill="makeBill"
          @pay="askPay"
          @close="askClose"
        />
      </ul>
    </div>

    <ConfirmSheet
      :open="paying !== undefined"
      :title="
        t(
          paying?.method !== 'cash'
            ? 'billing.cashier.confirmTransferTitle'
            : overview?.qrEnabled
              ? 'billing.cashier.confirmCashTitle'
              : 'billing.cashier.confirmCounterTitle',
        )
      "
      :confirm-label="
        t('billing.cashier.confirmPay', { amount: formatVnd(payBillOf?.amountVnd ?? 0) })
      "
      :cancel-label="t('sheet.cancel')"
      :busy="busy"
      @confirm="confirmPay"
      @cancel="paying = undefined"
    >
      <p class="cashier-page__sheet-text">
        <strong>
          {{
            t('billing.cashier.confirmBody', {
              table: paying?.session.tableName ?? '',
              amount: formatVnd(payBillOf?.amountVnd ?? 0),
              code: payBillOf?.code ?? '',
            })
          }}
        </strong>
      </p>
      <p class="cashier-page__sheet-text">
        {{
          paying?.method === 'cash'
            ? t('billing.cashier.confirmCashCheck')
            : t('billing.cashier.confirmCheck', { memo: payBillOf?.memo ?? '' })
        }}
      </p>
      <FormAlert v-if="actionError" :message="actionError" />
    </ConfirmSheet>

    <ConfirmSheet
      :open="closing !== undefined"
      :variant="(closing?.dueVnd ?? 0) > 0 ? 'danger' : 'primary'"
      :title="t('billing.cashier.closeTitle', { table: closing?.tableName ?? '' })"
      :confirm-label="t('billing.cashier.closeConfirm')"
      :cancel-label="t('sheet.cancel')"
      :busy="busy"
      @confirm="confirmClose"
      @cancel="closing = undefined"
    >
      <p class="cashier-page__sheet-text">
        {{
          (closing?.dueVnd ?? 0) > 0
            ? t('billing.cashier.closeUnpaidBody', { amount: formatVnd(closing?.dueVnd ?? 0) })
            : t('billing.cashier.closeBody')
        }}
      </p>
      <TextAreaField
        v-if="(closing?.dueVnd ?? 0) > 0"
        v-model="reason"
        :label="t('billing.cashier.closeReason')"
        :hint="t('billing.cashier.closeReasonHint')"
        :error="reasonError"
        :maxlength="CLOSE_REASON_MAX"
        :rows="2"
      />
      <FormAlert v-if="actionError" :message="actionError" />
    </ConfirmSheet>
  </RoleShell>
</template>

<style scoped>
.cashier-page {
  display: grid;
  gap: var(--space-3);
}

.cashier-page__title {
  margin: 0;
  font-size: var(--font-size-title);
}

.cashier-page__lead {
  margin: 0;
  color: var(--color-text-muted);
}

.cashier-page__banner {
  display: flex;
  gap: var(--space-2);
  align-items: flex-start;
  margin: 0;
  padding: var(--space-3);
  border-radius: var(--radius-2);
  background: var(--color-surface-muted);
}

.cashier-page__banner > svg {
  flex: none;
}

.cashier-page__banner--warning {
  font-weight: var(--font-weight-medium);
  color: var(--color-warning);
  background: var(--color-warning-bg);
}

.cashier-page__list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.cashier-page__sheet-text {
  margin: 0 0 var(--space-2);
}
</style>
