import { useRouter } from 'vue-router';
import { canOpen } from '@/features/roles/role-home';
import { useSessionStore } from '@/stores/session';

/**
 * Whether the signed-in person may open a path, read from the route's own `meta.roles` (the same
 * rule the router guard applies), so navigation never offers a page that would bounce them.
 */
export const useReachable = () => {
  const router = useRouter();
  const session = useSessionStore();
  return (path: string): boolean => {
    const role = session.me?.user.role;
    if (role === undefined) return false;
    const target = router.resolve(path);
    return (
      target.matched.length > 0 && target.name !== 'not-found' && canOpen(role, target.meta.roles)
    );
  };
};
