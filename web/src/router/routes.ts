import type { RouteRecordRaw } from 'vue-router';
import { menuRoutes } from '@/features/menu/routes';
import { settingsRoutes } from '@/features/settings/routes';
import { tablesRoutes } from '@/features/tables/routes';
import { rolesRoutes } from '@/features/roles/routes';
import { staffRoutes } from '@/features/staff/routes';
import { adminRoutes } from '@/features/admin/routes';
import { billingRoutes } from '@/features/billing/routes';
import { bookingRoutes } from '@/features/booking/routes';

// Each feature exports its routes from its own file and adds one spread line here.
export const coreRoutes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'landing',
    component: () => import('@/app/pages/LandingPage.vue'),
    meta: { title: 'TableQR' },
  },
  {
    path: '/dang-ky',
    name: 'sign-up',
    component: () => import('@/app/pages/SignUpPage.vue'),
    meta: { guestOnly: true, title: 'Đăng ký nhà hàng' },
  },
  {
    path: '/dang-nhap',
    name: 'sign-in',
    component: () => import('@/app/pages/SignInPage.vue'),
    meta: { guestOnly: true, title: 'Đăng nhập' },
  },
  {
    path: '/quan-ly',
    name: 'owner-home',
    component: () => import('@/app/pages/OwnerHomePage.vue'),
    meta: { staff: true, roles: ['owner'], title: 'Tổng quan' },
  },
];

// One spread per line, so parallel merges stay additive.
// prettier-ignore
export const featureRoutes: RouteRecordRaw[] = [
  ...menuRoutes,
  ...settingsRoutes,
  ...tablesRoutes,
  ...rolesRoutes,
  ...staffRoutes,
  ...adminRoutes,
  ...billingRoutes,
  ...bookingRoutes,
];
