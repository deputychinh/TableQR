import type { RouteRecordRaw } from 'vue-router';

const page = () => import('./RoleHomePage.vue');

/** Cashier home placeholder (AC14) until TQR-019; `/bep` and `/phuc-vu` live in their features. */
export const rolesRoutes: RouteRecordRaw[] = [
  {
    path: '/thu-ngan',
    name: 'cashier-home',
    component: page,
    props: { role: 'cashier' },
    meta: { staff: true, roles: ['cashier'], title: 'Thu ngân' },
  },
];
