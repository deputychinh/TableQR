import type { RouteRecordRaw } from 'vue-router';

export const menuRoutes: RouteRecordRaw[] = [
  {
    path: '/quan-ly/thuc-don',
    name: 'owner-menu',
    component: () => import('./pages/MenuPage.vue'),
    meta: { staff: true, title: 'Thực đơn' },
  },
  {
    path: '/quan-ly/thuc-don/xem-truoc',
    name: 'owner-menu-preview',
    component: () => import('./pages/MenuPreviewPage.vue'),
    meta: { staff: true, title: 'Xem như khách' },
  },
];
