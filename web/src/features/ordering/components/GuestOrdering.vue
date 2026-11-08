<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { DoorClosed, ReceiptText, ShoppingBasket, Wifi, WifiOff } from 'lucide-vue-next';
import BaseButton from '@/components/BaseButton.vue';
import EmptyState from '@/components/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import FormAlert from '@/components/FormAlert.vue';
import LoadingState from '@/components/LoadingState.vue';
import { useStream } from '@/composables/useStream';
import { formatVnd } from '@/features/menu/price';
import GuestMenuList from '@/features/menu/components/GuestMenuList.vue';
import { GUEST_STREAM_URL, type GuestSession } from '../api';
import { canAdd, quantityOf } from '../cart';
import { useGuestOrdering } from '../composables/useGuestOrdering';
import CartSheet from './CartSheet.vue';
import ItemQuantity from './ItemQuantity.vue';
import OrderList from './OrderList.vue';

/**
 * A joined phone (S7, S11): menu with order buttons and a sticky "Gửi món" bar, the cart sheet,
 * and "Món đã gọi" with live dish statuses. The tab lives in the URL (`?xem=da-goi`).
 */
const props = defineProps<{ initial: GuestSession }>();
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const ordering = useGuestOrdering(props.initial);
const { session, menu, menuStatus, cart, count, total, closed, submitting, notice } = ordering;
const cartOpen = ref(false);

const { status: streamStatus } = useStream<GuestSession>(GUEST_STREAM_URL, {
  onSnapshot: ordering.onSnapshot,
  onDelta: ordering.onDelta,
});

const view = computed(() => (route.query.xem === 'da-goi' ? 'orders' : 'menu'));
const orderCount = computed(() => session.value.orders.length);
const showView = (next: 'menu' | 'orders') =>
  router.replace({ query: next === 'orders' ? { xem: 'da-goi' } : {} });

/** TQR-018: the bill page of this table (`/t/:qrToken/hoa-don`), reached by tapping, never by URL. */
const billTo = computed(
  () =>
    `/t/${encodeURIComponent(typeof route.params.qrToken === 'string' ? route.params.qrToken : '')}/hoa-don`,
);
const openBill = () => router.push(billTo.value);
/** With an empty cart and something ordered, the bottom bar's one action is the bill. */
const showBillBar = computed(() => count.value === 0 && orderCount.value > 0 && !closed.value);

const submit = async () => {
  if (await ordering.submit()) {
    cartOpen.value = false;
    await showView('orders');
  } else if (notice.value?.kind === 'changed' || notice.value?.kind === 'network') {
    cartOpen.value = true;
  }
};

/** What went wrong with the last submission, in plain words (AC25 lists what changed). */
const alert = computed((): string | undefined => {
  const current = notice.value;
  if (current?.kind === 'network') return t('ordering.cart.network');
  if (current?.kind === 'error') return t('ordering.cart.error');
  if (current?.kind === 'too-many') return t('ordering.cart.tooManyOrders');
  if (current?.kind !== 'changed') return undefined;
  const changes = current.changes.map((change) =>
    change.kind === 'removed'
      ? t('ordering.cart.changeRemoved', { name: change.name })
      : t('ordering.cart.changePrice', {
          name: change.name,
          price: formatVnd(change.priceVnd ?? 0),
        }),
  );
  return [t('ordering.cart.changed'), ...changes].join(' ');
});

onMounted(ordering.loadMenu);
</script>

<template>
  <div
    class="guest-ordering"
    :class="{
      'guest-ordering--with-bar': count > 0 && !closed,
      'guest-ordering--with-bill': showBillBar,
    }"
  >
    <EmptyState
      v-if="closed"
      :heading-level="1"
      :title="t('ordering.closed.title')"
      :body="t('ordering.closed.body')"
    >
      <template #icon><DoorClosed :size="32" /></template>
    </EmptyState>

    <nav v-else class="guest-ordering__tabs" :aria-label="t('ordering.tabs.label')">
      <button
        type="button"
        class="guest-ordering__tab"
        :aria-current="view === 'menu' ? 'page' : undefined"
        @click="showView('menu')"
      >
        {{ t('ordering.tabs.menu') }}
      </button>
      <button
        type="button"
        class="guest-ordering__tab"
        :aria-current="view === 'orders' ? 'page' : undefined"
        @click="showView('orders')"
      >
        {{
          orderCount > 0
            ? t('ordering.tabs.ordersCount', { n: orderCount })
            : t('ordering.tabs.orders')
        }}
      </button>
    </nav>

    <p v-if="notice?.kind === 'sent'" class="guest-ordering__sent" role="status">
      {{ t('ordering.cart.sent') }}
    </p>
    <FormAlert v-else-if="alert && !cartOpen" :message="alert" />

    <template v-if="!closed && view === 'menu'">
      <h1 class="guest-ordering__title">{{ t('ordering.tabs.menu') }}</h1>
      <LoadingState v-if="menuStatus === 'loading'" :label="t('ordering.menu.loading')" />
      <ErrorState
        v-else-if="menuStatus === 'error'"
        :message="t('ordering.menu.loadError')"
        :retry-label="t('ordering.checkIn.retry')"
        @retry="ordering.loadMenu"
      />
      <EmptyState
        v-else-if="menu && menu.categories.length === 0"
        :title="t('ordering.menu.empty')"
      />
      <GuestMenuList v-else-if="menu" :categories="menu.categories">
        <template #action="{ item }">
          <ItemQuantity
            v-if="item.orderable"
            :name="item.name"
            :quantity="quantityOf(cart, item.id)"
            :can-add="canAdd(cart, item.id)"
            @add="ordering.add(item)"
            @remove="ordering.remove(item.id)"
          />
        </template>
      </GuestMenuList>
    </template>

    <template v-else-if="!closed">
      <h1 class="guest-ordering__title">{{ t('ordering.tabs.orders') }}</h1>
      <p
        class="guest-ordering__live"
        :class="{ 'guest-ordering__live--off': streamStatus === 'reconnecting' }"
        role="status"
      >
        <WifiOff v-if="streamStatus === 'reconnecting'" :size="16" aria-hidden="true" />
        <Wifi v-else :size="16" aria-hidden="true" />
        {{
          streamStatus === 'reconnecting'
            ? t('ordering.orders.reconnecting')
            : t('ordering.orders.live')
        }}
      </p>
      <EmptyState v-if="orderCount === 0" :title="t('ordering.orders.empty')">
        <template #action>
          <BaseButton variant="secondary" @click="showView('menu')">
            {{ t('ordering.orders.emptyAction') }}
          </BaseButton>
        </template>
      </EmptyState>
      <OrderList
        v-else
        :orders="session.orders"
        :party-size="session.session.partySize"
        :bill-to="billTo"
      />
    </template>

    <div v-if="count > 0 && !closed" class="guest-ordering__bar">
      <p class="guest-ordering__summary">
        {{ t('ordering.cart.summary', { n: count, total: formatVnd(total) }) }}
      </p>
      <div class="guest-ordering__actions">
        <BaseButton variant="secondary" size="lg" @click="cartOpen = true">
          <ShoppingBasket :size="20" aria-hidden="true" />
          {{ t('ordering.cart.open', { n: count }) }}
        </BaseButton>
        <BaseButton size="lg" :loading="submitting" @click="submit">
          {{ t('ordering.cart.submit') }}
        </BaseButton>
      </div>
    </div>

    <div v-else-if="showBillBar" class="guest-ordering__bar">
      <BaseButton size="lg" block @click="openBill">
        <ReceiptText :size="20" aria-hidden="true" />
        {{ t('ordering.orders.bill') }}
      </BaseButton>
    </div>

    <CartSheet
      :open="cartOpen"
      :cart="cart"
      :total="total"
      :submitting="submitting"
      @close="cartOpen = false"
      @add="ordering.add"
      @remove="ordering.remove"
      @note="ordering.note"
      :alert="alert"
      @submit="submit"
    />
  </div>
</template>

<style scoped>
.guest-ordering {
  display: grid;
  gap: var(--space-3);
}

.guest-ordering--with-bar {
  padding-block-end: calc(var(--target-large) * 2 + var(--space-5));
}

.guest-ordering--with-bill {
  padding-block-end: calc(var(--target-large) + var(--space-5));
}

.guest-ordering__tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-1);
  padding: var(--space-1);
  border-radius: var(--radius-3);
  background: var(--color-surface-muted);
}

.guest-ordering__tab {
  min-block-size: var(--target-min);
  border: 0;
  border-radius: var(--radius-2);
  font: inherit;
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
  background: transparent;
  cursor: pointer;
}

.guest-ordering__tab[aria-current='page'] {
  font-weight: var(--font-weight-bold);
  background: var(--color-surface);
  box-shadow: var(--shadow-1);
}

.guest-ordering__title {
  margin: 0;
  font-size: var(--font-size-title);
}

.guest-ordering__sent {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-2);
  background: var(--color-success-bg);
}

.guest-ordering__live {
  display: inline-flex;
  gap: var(--space-1);
  align-items: center;
  margin: 0;
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
}

.guest-ordering__live--off {
  color: var(--color-warning);
}

.guest-ordering__bar {
  position: fixed;
  inset-inline: 0;
  inset-block-end: 0;
  z-index: var(--z-header);
  display: grid;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  padding-block-end: max(var(--space-3), env(safe-area-inset-bottom));
  border-block-start: 1px solid var(--color-border);
  background: var(--color-surface);
  box-shadow: var(--shadow-2);
}

.guest-ordering__summary {
  margin: 0;
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.guest-ordering__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
  white-space: nowrap;
}

@media (width >= 600px) {
  .guest-ordering__bar {
    grid-template-columns: auto auto;
    gap: var(--space-4);
    align-items: center;
    justify-content: center;
  }
}
</style>
