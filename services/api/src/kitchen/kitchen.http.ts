import { z } from 'zod';
import { ErrorCode } from '../common/enums/error-code.enum.js';
import { DomainError } from '../common/errors/domain.error.js';
import type { TenantId } from '../common/tenant.js';
import type { Principal } from '../identity/auth.service.js';
import { notFound } from './kitchen.errors.js';

/**
 * Who does what on the service floor (TQR-014/015 "Roles"): cooks (and the owner) work the
 * station queues; waiters, cashiers (who often run dishes in small shops) and the owner serve.
 * A waiter cannot cook and a cook cannot mark a dish served — each screen has one job.
 */
export const COOKS = ['owner', 'kitchen'] as const;
export const SERVERS = ['owner', 'cashier', 'waiter'] as const;

const uuid = z.uuid();

/** A malformed id is just an id that does not exist here: 404, never 422. */
export const idParam = (value: string): string => {
  if (!uuid.safeParse(value).success) throw notFound();
  return value;
};

export const tenantOf = (principal: Principal): TenantId => {
  if (!principal.tenantId) throw new DomainError(ErrorCode.Forbidden, 403);
  return principal.tenantId;
};
