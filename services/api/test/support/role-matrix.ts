/**
 * AC15 role matrix: every staff endpoint and the roles allowed to call it (deny by default).
 * Each later item appends its endpoints here; `test/roles.e2e-spec.ts` checks every row for every
 * role — allowed roles must not get 401/403, every other role must get 403 `FORBIDDEN`.
 *
 * `path` and `body` receive the ids of a fixture restaurant (see `MatrixFixture`) so allowed
 * calls reach real rows. Calls must be safe to repeat: they run once per allowed role.
 */
export type MatrixRole = 'owner' | 'cashier' | 'waiter' | 'kitchen' | 'platform_admin';

export interface MatrixFixture {
  /** A waiter of the fixture restaurant, safe to rename. */
  staffId: string;
  /** A restaurant nobody signs in to, safe to suspend and reactivate. */
  spareRestaurantId: string;
  /** A fresh email for create calls. */
  email: () => string;
}

export interface MatrixRow {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: (f: MatrixFixture) => string;
  allowed: readonly MatrixRole[];
  body?: (f: MatrixFixture) => unknown;
}

export const ALL_ROLES: readonly MatrixRole[] = [
  'owner',
  'cashier',
  'waiter',
  'kitchen',
  'platform_admin',
];
const OWNER = ['owner'] as const;
const ADMIN = ['platform_admin'] as const;

export const ROLE_MATRIX: readonly MatrixRow[] = [
  // identity (TQR-004)
  { method: 'get', path: () => '/api/me', allowed: ALL_ROLES },
  // staff (TQR-005)
  { method: 'get', path: () => '/api/staff', allowed: OWNER },
  {
    method: 'post',
    path: () => '/api/staff',
    allowed: OWNER,
    body: (f) => ({
      displayName: 'Ma trận',
      email: f.email(),
      password: 'ma-tran-mat-khau-1',
      role: 'waiter',
    }),
  },
  { method: 'get', path: (f) => `/api/staff/${f.staffId}`, allowed: OWNER },
  {
    method: 'patch',
    path: (f) => `/api/staff/${f.staffId}`,
    allowed: OWNER,
    body: () => ({ displayName: 'Phục vụ' }),
  },
  {
    method: 'put',
    path: (f) => `/api/staff/${f.staffId}/password`,
    allowed: OWNER,
    body: () => ({ password: 'ma-tran-mat-khau-1' }),
  },
  // platform admin (TQR-009)
  { method: 'get', path: () => '/api/admin/restaurants', allowed: ADMIN },
  {
    method: 'post',
    path: (f) => `/api/admin/restaurants/${f.spareRestaurantId}/suspend`,
    allowed: ADMIN,
  },
  {
    method: 'post',
    path: (f) => `/api/admin/restaurants/${f.spareRestaurantId}/reactivate`,
    allowed: ADMIN,
  },
];
