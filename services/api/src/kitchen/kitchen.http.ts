import { uuidParam } from '../common/http/params.js';

export { tenantOf } from '../common/tenant.js';

/**
 * Who does what on the service floor (TQR-014/015 "Roles"): cooks (and the owner) work the
 * station queues; waiters, cashiers (who often run dishes in small shops) and the owner serve.
 * A waiter cannot cook and a cook cannot mark a dish served — each screen has one job.
 */
export const COOKS = ['owner', 'kitchen'] as const;
export const SERVERS = ['owner', 'cashier', 'waiter'] as const;

/** A malformed id is just an id that does not exist here: 404, never 422 (shared parser). */
export const idParam = uuidParam;
