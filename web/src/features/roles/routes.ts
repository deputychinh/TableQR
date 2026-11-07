import type { RouteRecordRaw } from 'vue-router';

const page = () => import('./RoleHomePage.vue');

/** Role homes (AC14); TQR-014/015 replace these placeholders with the real screens. */
export const rolesRoutes: RouteRecordRaw[] = [
  {
    // Cashier screen (TQR-019); the owner may confirm payments too.
    path: '/thu-ngan',
    name: 'cashier-home',
    component: () => import('@/features/billing/pages/CashierPage.vue'),
    meta: { staff: true, roles: ['cashier', 'owner'], title: 'Thu ngân' },
  },
  {
    path: '/phuc-vu',
    name: 'waiter-home',
    component: page,
    props: { role: 'waiter' },
    meta: { staff: true, roles: ['waiter'], title: 'Phục vụ' },
  },
  {
    path: '/bep',
    name: 'kitchen-home',
    component: page,
    props: { role: 'kitchen' },
    meta: { staff: true, roles: ['kitchen'], title: 'Bếp' },
  },
];
