import type { RouteRecordRaw } from 'vue-router';

export const settingsRoutes: RouteRecordRaw[] = [
  {
    path: '/quan-ly/cai-dat',
    name: 'owner-settings',
    component: () => import('./SettingsPage.vue'),
    meta: { staff: true, title: 'Cài đặt' },
  },
];
