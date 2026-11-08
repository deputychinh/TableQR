import type { RouteRecordRaw } from 'vue-router';

/** Kitchen screen (TQR-014): cooks, and the owner who sometimes helps in the kitchen. */
export const kitchenRoutes: RouteRecordRaw[] = [
  {
    path: '/bep',
    name: 'kitchen-home',
    component: () => import('./pages/KitchenPage.vue'),
    meta: { staff: true, roles: ['kitchen', 'owner'], title: 'Bếp' },
  },
];
