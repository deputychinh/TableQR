/** Roles a person inside a restaurant can hold (platform_admin lives outside restaurants). */
export const RESTAURANT_ROLES = ['owner', 'cashier', 'waiter', 'kitchen'] as const;
export type RestaurantRole = (typeof RESTAURANT_ROLES)[number];

/** Roles the owner picks when adding a person (spec S5); promotion to owner is a later change. */
export const NEW_STAFF_ROLES = ['cashier', 'waiter', 'kitchen'] as const;

export const MIN_DISPLAY_NAME_LENGTH = 1;
export const MAX_DISPLAY_NAME_LENGTH = 60;
/** List endpoints are capped (docs/security.md). */
export const MAX_STAFF_PER_RESTAURANT_LIST = 200;

export enum StaffErrorCode {
  /** The owner tried to disable, demote or reset the password of their own account here. */
  CannotChangeSelf = 'CANNOT_CHANGE_SELF',
  /** The change would leave the restaurant without an active owner. */
  LastOwner = 'LAST_OWNER',
}

export interface StaffChange {
  role?: RestaurantRole;
  disabled?: boolean;
  displayName?: string;
  password?: string;
}

export interface StaffTarget {
  id: string;
  role: RestaurantRole;
  disabled: boolean;
}

/** True when the change takes away the target's ability to act as an active owner. */
const removesOwner = (target: StaffTarget, change: StaffChange): boolean =>
  target.role === 'owner' &&
  !target.disabled &&
  (change.disabled === true || (change.role !== undefined && change.role !== 'owner'));

/**
 * AC16 guard rails, decided before any write:
 * - an owner cannot disable, demote or reset the password of their own account (no self lock-out);
 * - a restaurant always keeps at least one active owner.
 * Renaming yourself is allowed. Returns the refusal code, or null when the change is allowed.
 */
export const staffChangeRefusal = (
  actorId: string,
  target: StaffTarget,
  change: StaffChange,
  activeOwners: number,
): StaffErrorCode | null => {
  const self = actorId === target.id;
  const sensitive =
    change.disabled !== undefined || change.role !== undefined || change.password !== undefined;
  if (self && sensitive) return StaffErrorCode.CannotChangeSelf;
  if (removesOwner(target, change) && activeOwners <= 1) return StaffErrorCode.LastOwner;
  return null;
};

/** A change that ends the person's sessions at once (AC16): disabling or a new password. */
export const endsSessions = (change: StaffChange): boolean =>
  change.disabled === true || change.password !== undefined;
