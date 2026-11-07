import { createRouter, createWebHistory, type RouteLocationNormalized } from 'vue-router';
import { setUnauthorizedHandler } from '@/api/client';
import { canOpen, roleHome } from '@/features/roles/role-home';
import { useSessionStore, type StaffRole } from '@/stores/session';
import { coreRoutes, featureRoutes } from './routes';

declare module 'vue-router' {
  interface RouteMeta {
    staff?: boolean;
    /** Roles that may open a staff page; omitted = owner only (deny by default). */
    roles?: StaffRole[];
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

/**
 * Staff pages need a session and one of the page's roles (else the user goes to their own home);
 * signed-in staff skip the sign-in/up pages and land on their role's home (AC14).
 */
export const sessionGuard = async (to: RouteLocationNormalized) => {
  const session = useSessionStore();
  if (session.me === undefined && (to.meta.staff || to.meta.guestOnly)) await session.load();
  const me = session.me;
  if (to.meta.staff && !me) return { path: '/dang-nhap', query: { next: to.fullPath } };
  if (to.meta.staff && me && !canOpen(me.user.role, to.meta.roles)) {
    return { path: roleHome(me.user.role) };
  }
  if (to.meta.guestOnly && me) return { path: roleHome(me.user.role) };
  return true;
};

/** A call answering 401 means the session ended (AC16): forget it and go to sign-in. */
export const onSessionEnded = async () => {
  useSessionStore().me = null;
  const current = router.currentRoute.value;
  if (current.meta.staff)
    await router.push({ path: '/dang-nhap', query: { next: current.fullPath } });
};

router.beforeEach(sessionGuard);
setUnauthorizedHandler(() => void onSessionEnded());
router.afterEach((to) => {
  document.title =
    to.meta.title && to.meta.title !== 'TableQR' ? `${to.meta.title} · TableQR` : 'TableQR';
});

export default router;
