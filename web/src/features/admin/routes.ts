import type { RouteRecordRaw } from 'vue-router';

/** Platform admin (TQR-009). */
export const adminRoutes: RouteRecordRaw[] = [
  {
    path: '/quan-tri',
    name: 'admin-restaurants',
    component: () => import('./pages/AdminRestaurantsPage.vue'),
    meta: { staff: true, roles: ['platform_admin'], title: 'Quản trị nền tảng' },
  },
];
