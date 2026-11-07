<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { CircleCheck, Landmark, RefreshCw, Store } from 'lucide-vue-next';
import StatusChip from '@/components/StatusChip.vue';
import QrImage from '@/features/tables/components/QrImage.vue';
import { formatVnd } from '@/features/menu/price';
import type { SessionBill } from '../api';

/**
 * A guest's bill (S12): amount large, VietQR with bank, holder and memo (AC40), or "Thanh toán tại
 * quầy" without a bank account (AC41), a notice when the code changed (AC42) and "Đã thanh toán"
 * once the cashier confirms (AC44). Presentational: the page loads and refreshes `bill`.
 */
const props = defineProps<{ bill: SessionBill; changed?: boolean }>();
const { t } = useI18n();

const current = computed(() => props.bill.bill);
const isPaid = computed(() => current.value?.status === 'paid' && props.bill.dueVnd === 0);
const isOpen = computed(() => current.value?.status === 'open');
</script>

<template>
  <article class="guest-bill" :aria-labelledby="`guest-bill-title-${bill.session.id}`">
    <h1 :id="`guest-bill-title-${bill.session.id}`" class="guest-bill__title">
      {{ t('billing.guest.title') }} · {{ bill.session.tableName }}
    </h1>

    <p v-if="changed" class="guest-bill__changed" role="status">
      <RefreshCw :size="20" aria-hidden="true" />
      {{ isOpen ? t('billing.guest.changed') : t('billing.guest.changedNoDue') }}
    </p>

    <section v-if="isPaid" class="guest-bill__paid" role="status">
      <CircleCheck :size="48" aria-hidden="true" class="guest-bill__paid-icon" />
      <h2 class="guest-bill__paid-title">{{ t('billing.guest.paidTitle') }}</h2>
      <p class="guest-bill__paid-body">
        {{ t('billing.guest.paidBody', { amount: formatVnd(bill.paidVnd) }) }}
      </p>
    </section>

    <section v-else-if="isOpen && current" class="guest-bill__pay">
      <p class="guest-bill__due-label">{{ t('billing.guest.due') }}</p>
      <p class="guest-bill__amount">{{ formatVnd(current.amountVnd) }}</p>
      <StatusChip tone="warning" :label="t('billing.status.open')" />

      <template v-if="bill.transfer">
        <h2 class="guest-bill__section-title">{{ t('billing.guest.scanTitle') }}</h2>
        <div class="guest-bill__qr">
          <QrImage
            :text="bill.transfer.payload"
            :alt="t('billing.guest.qrAlt', { amount: formatVnd(current.amountVnd) })"
          />
        </div>
        <p class="guest-bill__scan">{{ t('billing.guest.scanHint') }}</p>
        <dl class="guest-bill__facts">
          <div class="guest-bill__fact">
            <dt>{{ t('billing.guest.bank') }}</dt>
            <dd>{{ bill.transfer.bankName }}</dd>
          </div>
          <div class="guest-bill__fact">
            <dt>{{ t('billing.guest.accountName') }}</dt>
            <dd>{{ bill.transfer.accountName }}</dd>
          </div>
          <div class="guest-bill__fact">
            <dt>{{ t('billing.guest.accountNumber') }}</dt>
            <dd class="guest-bill__mono">{{ bill.transfer.accountNumber }}</dd>
          </div>
          <div class="guest-bill__fact">
            <dt>{{ t('billing.guest.memo') }}</dt>
            <dd class="guest-bill__mono guest-bill__memo">{{ current.memo }}</dd>
          </div>
        </dl>
        <p class="guest-bill__hint">
          <Landmark :size="18" aria-hidden="true" />
          {{ t('billing.guest.memoHint') }}
        </p>
      </template>

      <div v-else class="guest-bill__counter">
        <Store :size="28" aria-hidden="true" />
        <div>
          <h2 class="guest-bill__section-title">{{ t('billing.guest.counterTitle') }}</h2>
          <p class="guest-bill__counter-body">{{ t('billing.guest.counterBody') }}</p>
          <p class="guest-bill__code">
            {{ t('billing.guest.code') }}:
            <strong class="guest-bill__mono">{{ current.code }}</strong>
          </p>
        </div>
      </div>
      <p class="guest-bill__hint">{{ t('billing.guest.live') }}</p>
    </section>

    <section v-if="bill.lines.length > 0" class="guest-bill__lines">
      <h2 class="guest-bill__section-title">{{ t('billing.guest.items') }}</h2>
      <ul class="guest-bill__list">
        <li v-for="line in bill.lines" :key="line.id" class="guest-bill__line">
          <span class="guest-bill__qty">{{
            t('billing.guest.quantity', { n: line.quantity })
          }}</span>
          <span class="guest-bill__name">{{ line.name }}</span>
          <span class="guest-bill__price">{{ formatVnd(line.lineTotalVnd) }}</span>
        </li>
      </ul>
      <dl class="guest-bill__totals">
        <div class="guest-bill__fact">
          <dt>{{ t('billing.guest.total') }}</dt>
          <dd>{{ formatVnd(bill.totalVnd) }}</dd>
        </div>
        <div v-if="bill.paidVnd > 0" class="guest-bill__fact">
          <dt>{{ t('billing.guest.alreadyPaid') }}</dt>
          <dd>{{ formatVnd(bill.paidVnd) }}</dd>
        </div>
      </dl>
    </section>
  </article>
</template>

<style scoped>
.guest-bill {
  display: grid;
  gap: var(--space-4);
}

.guest-bill__title {
  margin: 0;
  font-size: var(--font-size-title);
}

.guest-bill__changed {
  display: flex;
  gap: var(--space-2);
  align-items: flex-start;
  margin: 0;
  padding: var(--space-3);
  border-radius: var(--radius-2);
  color: var(--color-warning);
  background: var(--color-warning-bg);
}

.guest-bill__paid {
  display: grid;
  gap: var(--space-2);
  justify-items: center;
  padding: var(--space-5) var(--space-3);
  border-radius: var(--radius-3);
  text-align: center;
  background: var(--color-success-bg);
}

.guest-bill__paid-icon {
  color: var(--color-primary);
}

.guest-bill__paid-title {
  margin: 0;
  font-size: var(--font-size-title);
}

.guest-bill__paid-body {
  margin: 0;
}

.guest-bill__pay {
  display: grid;
  gap: var(--space-3);
  justify-items: center;
  padding: var(--space-4) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-3);
  text-align: center;
  background: var(--color-surface);
}

.guest-bill__due-label {
  margin: 0;
  color: var(--color-text-muted);
}

.guest-bill__amount {
  margin: 0;
  font-size: var(--font-size-display);
  font-weight: var(--font-weight-bold);
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.guest-bill__section-title {
  margin: 0;
  font-size: var(--font-size-lead);
}

.guest-bill__qr {
  inline-size: min(100%, 17rem);
  padding: var(--space-2);
  border-radius: var(--radius-2);
  background: var(--color-white);
}

.guest-bill__scan {
  margin: 0;
  font-weight: var(--font-weight-bold);
}

.guest-bill__facts,
.guest-bill__totals {
  display: grid;
  gap: var(--space-2);
  inline-size: 100%;
  margin: 0;
  text-align: start;
}

.guest-bill__fact {
  display: flex;
  gap: var(--space-3);
  justify-content: space-between;
  padding-block: var(--space-1);
  border-block-end: 1px solid var(--color-border);
}

.guest-bill__fact dt {
  color: var(--color-text-muted);
}

.guest-bill__fact dd {
  margin: 0;
  font-weight: var(--font-weight-medium);
  text-align: end;
  overflow-wrap: anywhere;
}

.guest-bill__mono {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}

.guest-bill__memo {
  font-weight: var(--font-weight-bold);
}

.guest-bill__hint {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  margin: 0;
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
}

.guest-bill__hint > svg,
.guest-bill__changed > svg,
.guest-bill__counter > svg {
  flex: none;
}

.guest-bill__counter {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
  inline-size: 100%;
  padding: var(--space-3);
  border-radius: var(--radius-2);
  text-align: start;
  background: var(--color-surface-muted);
}

.guest-bill__counter-body,
.guest-bill__code {
  margin: var(--space-1) 0 0;
}

.guest-bill__lines {
  display: grid;
  gap: var(--space-3);
}

.guest-bill__list {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.guest-bill__line {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--space-2);
  align-items: baseline;
}

.guest-bill__qty {
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.guest-bill__price {
  font-variant-numeric: tabular-nums;
}
</style>
