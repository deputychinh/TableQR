import type { RouteRecordRaw } from 'vue-router';

/** Role homes: cashier → billing (TQR-019); `/bep` and `/phuc-vu` live in their features (TQR-014/015). */
export const rolesRoutes: RouteRecordRaw[] = [
  {
    // Cashier screen (TQR-019); the owner may confirm payments too.
    path: '/thu-ngan',
    name: 'cashier-home',
    component: () => import('@/features/billing/pages/CashierPage.vue'),
    meta: { staff: true, roles: ['cashier', 'owner'], title: 'Thu ngân' },
  },
];
