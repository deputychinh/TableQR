import { createRouter, createWebHistory, type RouteLocationNormalized } from 'vue-router';
import { useSessionStore } from '@/stores/session';
import { coreRoutes, featureRoutes } from './routes';

declare module 'vue-router' {
  interface RouteMeta {
    staff?: boolean;
    guestOnly?: boolean;
    title?: string;
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    ...coreRoutes,
    ...featureRoutes,
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/app/pages/NotFoundPage.vue'),
      meta: { title: 'Không tìm thấy' },
    },
  ],
});

/** Staff pages need a session; signed-in staff skip the sign-in/up pages. */
export const sessionGuard = async (to: RouteLocationNormalized) => {
  const session = useSessionStore();
  if (session.me === undefined && (to.meta.staff || to.meta.guestOnly)) await session.load();
  if (to.meta.staff && !session.me) return { path: '/dang-nhap', query: { next: to.fullPath } };
  if (to.meta.guestOnly && session.me) return { path: '/quan-ly' };
  return true;
};

router.beforeEach(sessionGuard);
router.afterEach((to) => {
  document.title =
    to.meta.title && to.meta.title !== 'TableQR' ? `${to.meta.title} · TableQR` : 'TableQR';
});

export default router;
