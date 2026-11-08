import type { RouteRecordRaw } from 'vue-router';

export const tablesRoutes: RouteRecordRaw[] = [
  {
    path: '/quan-ly/ban',
    name: 'tables',
    component: () => import('./pages/TablesPage.vue'),
    meta: { staff: true, roles: ['owner', 'cashier', 'waiter'], title: 'Bàn & mã QR' },
  },
  {
    // Printable sheet: no app shell so only the QR cards reach the paper.
    path: '/quan-ly/ban/in',
    name: 'tables-print',
    component: () => import('./pages/TablePrintPage.vue'),
    meta: { staff: true, roles: ['owner'], title: 'In mã QR' },
  },
];
