import type { RouteRecordRaw } from 'vue-router';

/** Waiter screen (TQR-015): ready dishes by table; cashiers and the owner run dishes too. */
export const servingRoutes: RouteRecordRaw[] = [
  {
    path: '/phuc-vu',
    name: 'waiter-home',
    component: () => import('./pages/ServingPage.vue'),
    meta: { staff: true, roles: ['waiter', 'cashier', 'owner'], title: 'Phục vụ' },
  },
];
