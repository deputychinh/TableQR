import type { RouteRecordRaw } from 'vue-router';

/** Owner's staff screens (TQR-005); owner only (the default for staff pages). */
export const staffRoutes: RouteRecordRaw[] = [
  {
    path: '/quan-ly/nhan-vien',
    name: 'staff-list',
    component: () => import('./pages/StaffListPage.vue'),
    meta: { staff: true, roles: ['owner'], title: 'Nhân viên' },
  },
  {
    path: '/quan-ly/nhan-vien/them',
    name: 'staff-add',
    component: () => import('./pages/StaffAddPage.vue'),
    meta: { staff: true, roles: ['owner'], title: 'Thêm nhân viên' },
  },
  {
    path: '/quan-ly/nhan-vien/:id',
    name: 'staff-detail',
    component: () => import('./pages/StaffDetailPage.vue'),
    props: true,
    meta: { staff: true, roles: ['owner'], title: 'Nhân viên' },
  },
];
