import type { RouteRecordRaw } from 'vue-router';

export const tablesRoutes: RouteRecordRaw[] = [
  {
    path: '/quan-ly/ban',
    name: 'tables',
    component: () => import('./pages/TablesPage.vue'),
    meta: { staff: true, roles: ['owner', 'cashier', 'waiter'], title: 'Bàn & mã QR' },
  },
  {
    // Printable sheet: no app shell so only the QR cards reach the paper. Floor staff may print
    // too: they replace a torn sticker during service (review ruling D5).
    path: '/quan-ly/ban/in',
    name: 'tables-print',
    component: () => import('./pages/TablePrintPage.vue'),
    meta: { staff: true, roles: ['owner', 'cashier', 'waiter'], title: 'In mã QR' },
  },
  {
    // Public guest entry a table's QR code opens; ordering arrives with TQR-011/012.
    path: '/t/:qrToken',
    name: 'guest-table',
    component: () => import('./pages/GuestTablePage.vue'),
    meta: { title: 'Gọi món' },
  },
];
