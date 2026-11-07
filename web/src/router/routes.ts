import type { RouteRecordRaw } from 'vue-router';
import { settingsRoutes } from '@/features/settings/routes';

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
    meta: { staff: true, title: 'Tổng quan' },
  },
];

export const featureRoutes: RouteRecordRaw[] = [...settingsRoutes];
