import type { RouteRecordRaw } from 'vue-router';

/** Guest ordering (TQR-011/012/016) and the waiter's review screen (TQR-013). */
export const orderingRoutes: RouteRecordRaw[] = [
  {
    // Public guest entry a table's QR code opens: check-in, menu, cart and live dish status.
    path: '/t/:qrToken',
    name: 'guest-table',
    component: () => import('./pages/GuestTablePage.vue'),
    meta: { title: 'Gọi món' },
  },
  {
    path: '/phuc-vu/duyet',
    name: 'waiter-review',
    component: () => import('./pages/ReviewPage.vue'),
    meta: { staff: true, roles: ['waiter', 'owner', 'cashier'], title: 'Duyệt đơn' },
  },
];
