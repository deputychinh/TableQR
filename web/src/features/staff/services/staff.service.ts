import { ApiError, getJson, sendJson } from '@/api/client';

export type RestaurantRole = 'owner' | 'cashier' | 'waiter' | 'kitchen';
export type NewStaffRole = Exclude<RestaurantRole, 'owner'>;

export const NEW_STAFF_ROLES: readonly NewStaffRole[] = ['kitchen', 'waiter', 'cashier'];
export const RESTAURANT_ROLES: readonly RestaurantRole[] = [
  'owner',
  'cashier',
  'waiter',
  'kitchen',
];

export interface StaffMember {
  id: string;
  displayName: string;
  email: string;
  role: RestaurantRole;
  active: boolean;
  createdAt: string;
}

export interface NewStaff {
  displayName: string;
  email: string;
  password: string;
  role: NewStaffRole;
}

export const listStaff = async (): Promise<StaffMember[]> =>
  (await getJson<{ items: StaffMember[] }>('/staff')).items;

export const getStaff = (id: string): Promise<StaffMember> =>
  getJson<StaffMember>(`/staff/${encodeURIComponent(id)}`);

export const createStaff = (input: NewStaff): Promise<StaffMember> =>
  sendJson<StaffMember>('POST', '/staff', input);

export const updateStaff = (
  id: string,
  change: { role?: RestaurantRole; active?: boolean; displayName?: string },
): Promise<StaffMember> =>
  sendJson<StaffMember>('PATCH', `/staff/${encodeURIComponent(id)}`, change);

export const resetStaffPassword = (id: string, password: string): Promise<void> =>
  sendJson<void>('PUT', `/staff/${encodeURIComponent(id)}/password`, { password });

/** Name to show for a person: their display name, else their email. */
export const nameOf = (member: Pick<StaffMember, 'displayName' | 'email'>): string =>
  member.displayName.trim() || member.email;

/** Maps an API error of a staff action to a locale key (form-level message). */
export const describeStaffError = (error: unknown): string => {
  if (!(error instanceof ApiError)) return 'errors.unexpected';
  const known: Record<string, string> = {
    CANNOT_CHANGE_SELF: 'staff.errors.self',
    LAST_OWNER: 'staff.errors.lastOwner',
    FORBIDDEN: 'staff.errors.forbidden',
    NOT_FOUND: 'staff.errors.notFound',
    EMAIL_TAKEN: 'staff.errors.emailTaken',
    NETWORK: 'errors.network',
  };
  return known[error.code] ?? 'errors.unexpected';
};
