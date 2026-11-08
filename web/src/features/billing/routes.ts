import type { RouteRecordRaw } from 'vue-router';

/** The cashier screen `/thu-ngan` is registered with the other role homes (roles/routes.ts). */
export const billingRoutes: RouteRecordRaw[] = [
  {
    // Public guest bill; the `tqr_guest` cookie decides which session (TQR-018).
    path: '/t/:qrToken/hoa-don',
    name: 'guest-bill',
    component: () => import('./pages/GuestBillPage.vue'),
    meta: { title: 'Hoá đơn' },
  },
];
