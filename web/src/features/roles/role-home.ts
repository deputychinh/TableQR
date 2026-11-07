import type { StaffRole } from '@/stores/session';

/** Where each role lands after sign-in (spec AC14). */
export const ROLE_HOME: Readonly<Record<StaffRole, string>> = {
  owner: '/quan-ly',
  cashier: '/thu-ngan',
  waiter: '/phuc-vu',
  kitchen: '/bep',
  platform_admin: '/quan-tri',
};

export const roleHome = (role: StaffRole): string => ROLE_HOME[role];

/** Staff pages without an explicit role list are owner pages (deny by default). */
export const DEFAULT_PAGE_ROLES: readonly StaffRole[] = ['owner'];

export const canOpen = (role: StaffRole, allowed: readonly StaffRole[] | undefined): boolean =>
  (allowed ?? DEFAULT_PAGE_ROLES).includes(role);
