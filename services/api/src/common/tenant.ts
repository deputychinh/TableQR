import { ErrorCode } from './enums/error-code.enum.js';
import { DomainError } from './errors/domain.error.js';

/** A restaurant id that came from an authenticated principal, never from request input (ADR 0003). */
export type TenantId = string & { readonly __brand: 'TenantId' };

export const asTenantId = (restaurantId: string): TenantId => restaurantId as TenantId;

/**
 * The caller's restaurant (ADR 0003). A principal without one (platform admin) has no tenant data:
 * 403 `FORBIDDEN` everywhere, the same answer the role guard gives.
 */
export const tenantOf = (principal: { tenantId: TenantId | null }): TenantId => {
  if (principal.tenantId === null) throw new DomainError(ErrorCode.Forbidden, 403);
  return principal.tenantId;
};
