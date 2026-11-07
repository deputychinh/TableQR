import type { RouteRecordRaw } from 'vue-router';

export const settingsRoutes: RouteRecordRaw[] = [
  {
    path: '/quan-ly/cai-dat',
    name: 'owner-settings',
    component: () => import('./SettingsPage.vue'),
    meta: { staff: true, roles: ['owner'], title: 'Cài đặt' },
  },
];
