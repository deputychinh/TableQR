import type { RouteRecordRaw } from 'vue-router';

export const bookingRoutes: RouteRecordRaw[] = [
  {
    // Public page the owner shares; no account needed (spec S14).
    path: '/r/:slug/dat-ban',
    name: 'guest-booking',
    component: () => import('./pages/GuestBookingPage.vue'),
    meta: { title: 'Đặt bàn' },
  },
  {
    path: '/dat-ban',
    name: 'bookings',
    component: () => import('./pages/BookingsPage.vue'),
    meta: { staff: true, roles: ['owner', 'cashier', 'waiter'], title: 'Đặt bàn' },
  },
];
