/** A restaurant id that came from an authenticated principal, never from request input (ADR 0003). */
export type TenantId = string & { readonly __brand: 'TenantId' };

export const asTenantId = (restaurantId: string): TenantId => restaurantId as TenantId;
