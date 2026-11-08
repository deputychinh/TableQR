/**
 * AC15 role matrix: every staff endpoint and the roles allowed to call it (deny by default).
 * Each later item appends its endpoints here; `test/roles.e2e-spec.ts` checks every row for every
 * role — allowed roles must not get 401/403, every other role must get 403 `FORBIDDEN`.
 *
 * `path` and `body` receive the ids of a fixture restaurant (see `MatrixFixture`) so allowed
 * calls reach real rows. Calls must be safe to repeat: they run once per allowed role.
 * A `stream` row (SSE) is checked by status only: the stream is opened and closed at once.
 * Every staff route of the app must be a row here or in `MATRIX_EXCLUSIONS` with a reason
 * (TQR-017 route-coverage guard); one-shot actions take a fresh fixture row per call.
 */
import { DEFAULT_RULES } from '../../src/settings/domain/house-rules.js';
import { OWNER_PASSWORD } from './http.js';
import { routeKey, type AppRoute } from './routes.js';

export type MatrixRole = 'owner' | 'cashier' | 'waiter' | 'kitchen' | 'platform_admin';

export interface MatrixFixture {
  /** A waiter of the fixture restaurant, safe to rename. */
  staffId: string;
  /** A restaurant nobody signs in to, safe to suspend and reactivate. */
  spareRestaurantId: string;
  /** A fresh email for create calls. */
  email: () => string;
  /** A table of the fixture restaurant (renamed and rotated by the owner rows). */
  tableId: string;
  /** A table the owner's DELETE row may remove. */
  spareTableId: string;
  /** An open session with an open bill (TQR-018). */
  sessionId: string;
  billId: string;
  /** A fresh open bill per call (paying twice would answer 409). */
  payableBillId: () => string;
  /** A fresh open, paid-up session per call (closing twice would answer 409). */
  closableSessionId: () => string;
  /** A pending booking of the fixture restaurant (confirm is safe to repeat). */
  bookingId: string;
  /** A fresh booking per call that already started, on its own free table (seat/cancel/no-show). */
  freshBookingId: () => string;
  /** A fresh table without a session per call (opening a session twice would answer 409). */
  freeTableId: () => string;
  /** A fresh held order per call (confirm/reject are one-shot, TQR-013). */
  heldOrderId: () => string;
  /** An order whose AC27 flag the waiter marks seen (safe to repeat). */
  flaggedOrderId: string;
  /** A kitchen station of the fixture restaurant (TQR-014). */
  stationId: string;
  /** A fresh item per call in the status the action needs (each call consumes one). */
  waitingItemId: () => string;
  cookingItemId: () => string;
  doneItemId: () => string;
  /** Menu rows (TQR-006, `stationId` below is shared): a category and item to edit, and spares. */
  spareStationId: string;
  categoryId: string;
  spareCategoryId: string;
  itemId: string;
  spareItemId: string;
  /** A unique name for create calls (names are unique per restaurant). */
  name: (prefix: string) => string;
}

export interface MatrixRow {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: (f: MatrixFixture) => string;
  allowed: readonly MatrixRole[];
  body?: (f: MatrixFixture) => unknown;
  /** Server-sent events: only the status of the opening response is checked. */
  stream?: boolean;
}

/** The fixture as `:name` placeholders: test titles and the route-coverage guard read paths with it. */
export const PLACEHOLDERS: MatrixFixture = {
  staffId: ':staffId',
  spareRestaurantId: ':restaurantId',
  email: () => 'new@example.com',
  tableId: ':tableId',
  spareTableId: ':spareTableId',
  sessionId: ':sessionId',
  billId: ':billId',
  payableBillId: () => ':billId',
  closableSessionId: () => ':sessionId',
  bookingId: ':bookingId',
  freshBookingId: () => ':bookingId',
  freeTableId: () => ':tableId',
  heldOrderId: () => ':orderId',
  flaggedOrderId: ':orderId',
  stationId: ':stationId',
  waitingItemId: () => ':itemId',
  cookingItemId: () => ':itemId',
  doneItemId: () => ':itemId',
  spareStationId: ':spareStationId',
  categoryId: ':categoryId',
  spareCategoryId: ':spareCategoryId',
  itemId: ':itemId',
  spareItemId: ':spareItemId',
  name: (prefix) => prefix,
};

export const ALL_ROLES: readonly MatrixRole[] = [
  'owner',
  'cashier',
  'waiter',
  'kitchen',
  'platform_admin',
];
const OWNER = ['owner'] as const;
const ADMIN = ['platform_admin'] as const;
const FLOOR = ['owner', 'cashier', 'waiter'] as const;
const CASHIER = ['owner', 'cashier'] as const;
const RESTAURANT = ['owner', 'cashier', 'waiter', 'kitchen'] as const;
const COOKS = ['owner', 'kitchen'] as const;
const BANK = { bin: '970436', accountNumber: '0123456789', accountName: 'Nguyễn Văn Ánh' };

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
  // settings (TQR-008)
  { method: 'get', path: () => '/api/restaurant/settings', allowed: OWNER },
  {
    method: 'put',
    path: () => '/api/restaurant/settings',
    allowed: OWNER,
    // The owner signed up through `signUp()`; a bank change re-sends the password (TQR-023).
    body: () => ({ rules: DEFAULT_RULES, bank: BANK, currentPassword: OWNER_PASSWORD }),
  },
  { method: 'get', path: () => '/api/restaurant/rules', allowed: RESTAURANT },
  // menu (TQR-006); the public GET /api/g/r/:slug/menu needs no session and is not a staff row
  { method: 'get', path: () => '/api/menu', allowed: RESTAURANT },
  {
    method: 'post',
    path: () => '/api/menu/stations',
    allowed: OWNER,
    body: (f) => ({ name: f.name('Khu') }),
  },
  {
    method: 'patch',
    path: (f) => `/api/menu/stations/${f.stationId}`,
    allowed: OWNER,
    body: () => ({ lateAfterMinutes: 20 }),
  },
  { method: 'delete', path: (f) => `/api/menu/stations/${f.spareStationId}`, allowed: OWNER },
  {
    method: 'post',
    path: () => '/api/menu/categories',
    allowed: OWNER,
    body: (f) => ({ name: f.name('Nhóm') }),
  },
  {
    method: 'patch',
    path: (f) => `/api/menu/categories/${f.categoryId}`,
    allowed: OWNER,
    body: () => ({ isMain: true }),
  },
  {
    method: 'post',
    path: (f) => `/api/menu/categories/${f.categoryId}/move`,
    allowed: OWNER,
    body: () => ({ direction: 'down' }),
  },
  { method: 'delete', path: (f) => `/api/menu/categories/${f.spareCategoryId}`, allowed: OWNER },
  {
    method: 'post',
    path: () => '/api/menu/items',
    allowed: OWNER,
    body: (f) => ({
      name: f.name('Món'),
      priceVnd: 45000,
      categoryId: f.categoryId,
      stationId: f.stationId,
    }),
  },
  {
    method: 'patch',
    path: (f) => `/api/menu/items/${f.itemId}`,
    allowed: OWNER,
    body: () => ({ priceVnd: 50000 }),
  },
  {
    method: 'put',
    path: (f) => `/api/menu/items/${f.itemId}/availability`,
    allowed: COOKS,
    body: () => ({ available: false }),
  },
  { method: 'delete', path: (f) => `/api/menu/items/${f.spareItemId}`, allowed: OWNER },
  // realtime (TQR-010)
  { method: 'get', path: () => '/api/stream/floor', allowed: FLOOR, stream: true },
  // tables (TQR-007)
  { method: 'get', path: () => '/api/tables', allowed: FLOOR },
  { method: 'get', path: (f) => `/api/tables/${f.tableId}`, allowed: FLOOR },
  {
    method: 'post',
    path: () => '/api/tables',
    allowed: OWNER,
    body: () => ({ name: `Bàn ${String(Date.now() % 100000)}`, seats: 4 }),
  },
  {
    method: 'patch',
    path: (f) => `/api/tables/${f.tableId}`,
    allowed: OWNER,
    body: () => ({ seats: 6 }),
  },
  { method: 'post', path: (f) => `/api/tables/${f.tableId}/rotate-qr`, allowed: OWNER },
  // archive (TQR-024): hide then show again, so the table stays usable for the rows after it
  { method: 'post', path: (f) => `/api/tables/${f.tableId}/archive`, allowed: OWNER },
  { method: 'post', path: (f) => `/api/tables/${f.tableId}/unarchive`, allowed: OWNER },
  { method: 'delete', path: (f) => `/api/tables/${f.spareTableId}`, allowed: OWNER },
  // billing (TQR-018/019)
  { method: 'get', path: () => '/api/bills/overview', allowed: CASHIER },
  { method: 'get', path: (f) => `/api/bills/${f.billId}`, allowed: CASHIER },
  {
    method: 'post',
    path: () => '/api/bills',
    allowed: FLOOR,
    body: (f) => ({ sessionId: f.sessionId }),
  },
  { method: 'get', path: (f) => `/api/sessions/${f.sessionId}/bill`, allowed: FLOOR },
  {
    method: 'post',
    path: (f) => `/api/bills/${f.payableBillId()}/pay`,
    allowed: CASHIER,
    body: () => ({ method: 'cash' }),
  },
  {
    method: 'post',
    path: (f) => `/api/sessions/${f.closableSessionId()}/close`,
    allowed: CASHIER,
  },
  // bookings (TQR-021); seat / cancel / no-show are one-way: a fresh booking per call
  { method: 'get', path: () => '/api/bookings', allowed: FLOOR },
  {
    method: 'post',
    path: (f) => `/api/bookings/${f.bookingId}/confirm`,
    allowed: FLOOR,
    body: () => ({}),
  },
  { method: 'post', path: (f) => `/api/bookings/${f.freshBookingId()}/seat`, allowed: FLOOR },
  { method: 'post', path: (f) => `/api/bookings/${f.freshBookingId()}/cancel`, allowed: FLOOR },
  { method: 'post', path: (f) => `/api/bookings/${f.freshBookingId()}/no-show`, allowed: FLOOR },
  // service floor (TQR-011, TQR-013); confirm/reject are one-shot: a fresh held order per call
  {
    method: 'post',
    path: () => '/api/sessions',
    allowed: FLOOR,
    body: (f) => ({ tableId: f.freeTableId(), partySize: 2 }),
  },
  {
    method: 'patch',
    path: (f) => `/api/sessions/${f.sessionId}`,
    allowed: FLOOR,
    body: () => ({ partySize: 2 }),
  },
  { method: 'get', path: () => '/api/orders/review', allowed: FLOOR },
  { method: 'post', path: (f) => `/api/orders/${f.heldOrderId()}/confirm`, allowed: FLOOR },
  { method: 'post', path: (f) => `/api/orders/${f.heldOrderId()}/reject`, allowed: FLOOR },
  { method: 'post', path: (f) => `/api/orders/${f.flaggedOrderId}/flag-seen`, allowed: FLOOR },
  // kitchen queue (TQR-014)
  {
    method: 'get',
    path: (f) => `/api/stream/station/${f.stationId}`,
    allowed: COOKS,
    stream: true,
  },
  { method: 'get', path: () => '/api/kitchen/stations', allowed: COOKS },
  { method: 'get', path: (f) => `/api/kitchen/stations/${f.stationId}/queue`, allowed: COOKS },
  {
    method: 'post',
    path: (f) => `/api/kitchen/items/${f.waitingItemId()}/start`,
    allowed: COOKS,
    body: () => ({ version: 1 }),
  },
  {
    method: 'post',
    path: (f) => `/api/kitchen/items/${f.cookingItemId()}/done`,
    allowed: COOKS,
    body: () => ({ version: 1, skipReason: 'ma trận' }),
  },
  {
    method: 'post',
    path: (f) => `/api/kitchen/items/${f.waitingItemId()}/cancel`,
    allowed: COOKS,
    body: () => ({ version: 1 }),
  },
  // serving (TQR-015): a cook cannot mark a dish served, a waiter cannot cook
  { method: 'get', path: () => '/api/serve/ready', allowed: FLOOR },
  {
    method: 'post',
    path: (f) => `/api/serve/items/${f.doneItemId()}/serve`,
    allowed: FLOOR,
    body: () => ({ version: 1 }),
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

/**
 * Routes that are deliberately not matrix rows (TQR-017 route-coverage guard), each with the reason
 * and the spec that covers it. Keys are `METHOD /path` with parameter names dropped (`routeKey`).
 */
export const MATRIX_EXCLUSIONS: readonly { route: string; reason: string }[] = [
  {
    route: 'POST /api/auth/signup',
    reason: 'public: creates a restaurant and its owner (auth.e2e-spec.ts)',
  },
  { route: 'POST /api/auth/login', reason: 'public: signs a person in (auth.e2e-spec.ts)' },
  {
    route: 'POST /api/auth/logout',
    reason: 'any caller, with or without a session; ends only its own (auth.e2e-spec.ts)',
  },
  { route: 'GET /api/health', reason: 'public liveness/readiness probe (health.e2e-spec.ts)' },
  {
    route: 'GET /api/test-roles/forgotten',
    reason: 'test-only route of roles.e2e-spec.ts: "deny by default" checks it for every role',
  },
];

/** Path prefixes outside the staff surface. */
export const EXCLUDED_PREFIXES: readonly { prefix: string; reason: string }[] = [
  {
    prefix: '/api/g/',
    reason:
      'guest and public routes: no staff session, the table token or public slug decides the tenant (ordering, billing, booking, guest-stream e2e specs)',
  },
];

/**
 * Routes of the running app that are neither a `ROLE_MATRIX` row nor excluded with a reason:
 * a new staff endpoint without a matrix row fails the guard in `roles.e2e-spec.ts`.
 */
export const uncoveredRoutes = (
  routes: readonly AppRoute[],
  matrix: readonly MatrixRow[],
): string[] => {
  const covered = new Set(matrix.map((row) => routeKey(row.method, row.path(PLACEHOLDERS))));
  const excluded = new Set(MATRIX_EXCLUSIONS.map((e) => e.route));
  const isExcluded = (key: string) =>
    excluded.has(key) ||
    EXCLUDED_PREFIXES.some((e) => (key.split(' ')[1] ?? '').startsWith(e.prefix));
  return [
    ...new Set(
      routes
        .map((r) => routeKey(r.method, r.path))
        .filter((k) => !covered.has(k) && !isExcluded(k)),
    ),
  ].sort();
};
