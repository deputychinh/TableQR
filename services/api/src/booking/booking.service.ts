import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, gt, gte, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { CLOCK, type Clock } from '../common/clock.js';
import { ErrorCode } from '../common/enums/error-code.enum.js';
import { DomainError } from '../common/errors/domain.error.js';
import { asTenantId, type TenantId } from '../common/tenant.js';
import { isUuid } from '../common/http/params.js';
import { DB, type Database } from '../db/database.module.js';
import { pgCode, pgConstraint } from '../db/pg-error.js';
import { restaurants } from '../db/schema.js';
import { RestaurantStatusService } from '../identity/restaurant-status.service.js';
import { publish } from '../realtime/publisher.js';
import { tableSessions } from '../service/service.schema.js';
import { readStoredRules } from '../settings/domain/house-rules.js';
import { diningTables } from '../tables/tables.schema.js';
import { bookings } from './booking.schema.js';
import {
  ACTIVE_STATUSES,
  BOOKING_LIMITS,
  BookingErrorCode,
  isLate,
  lateAt,
  nextStatus,
  retentionCutoff,
  type BookingAction,
  type BookingStatus,
} from './domain/booking-rules.js';
import {
  candidateTables,
  freeTable,
  nearestFreeStarts,
  type HeldRange,
  type SeatedTable,
} from './domain/nearest-free.js';
import {
  checkSlot,
  dayStartTimes,
  localDayBounds,
  localToUtc,
  utcToLocal,
} from './domain/slots.js';

const EXCLUSION_VIOLATION = '23P01';
const UNIQUE_VIOLATION = '23505';
const DEADLOCK = '40P01';
const DEADLOCK_ATTEMPTS = 3;
const NO_OVERLAP = 'bookings_no_overlap';
const IDEMPOTENCY_KEY = 'bookings_tenant_idempotency_key';
const ONE_OPEN_SESSION = 'table_sessions_one_open_per_table';
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const DAY_LIST_MAX = 200;

export interface BookingInput {
  date: string;
  time: string;
  partySize: number;
  name: string;
  /** Already normalised to E.164. */
  phone: string;
  note: string | null;
}

/** What the guest sees after booking (no table: staff may still move it). */
export interface GuestBookingView {
  id: string;
  status: BookingStatus;
  date: string;
  time: string;
  partySize: number;
  startsAt: string;
  endsAt: string;
}

export interface SlotsView {
  restaurant: { name: string; slug: string };
  date: string;
  enabled: boolean;
  slotMinutes: number;
  /** Future start times of that day; `free` = a table for the party is still open. */
  times: { time: string; free: boolean }[];
}

export interface BookingView {
  id: string;
  status: BookingStatus;
  tableId: string;
  tableName: string;
  partySize: number;
  guestName: string | null;
  guestPhone: string | null;
  note: string | null;
  date: string;
  time: string;
  startsAt: string;
  endsAt: string;
  /** AC53: still waiting 15 minutes after the start. */
  late: boolean;
  lateAt: string;
  version: number;
  createdAt: string;
}

type Executor = Pick<Database, 'select' | 'execute'>;
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

interface GuestRestaurant {
  id: TenantId;
  name: string;
  slug: string;
  rules: ReturnType<typeof readStoredRules>;
}

const notFound = (): DomainError => new DomainError(ErrorCode.NotFound, 404);

const wrongStatus = (status: BookingStatus): DomainError =>
  new DomainError(BookingErrorCode.WrongStatus, 409, {
    detail: 'Đặt bàn này đã đổi trạng thái',
    extensions: { bookingStatus: status },
  });

const bookingColumns = {
  id: bookings.id,
  status: bookings.status,
  tableId: bookings.tableId,
  tableName: diningTables.name,
  partySize: bookings.partySize,
  guestName: bookings.guestName,
  guestPhone: bookings.guestPhone,
  note: bookings.note,
  startsAt: bookings.startsAt,
  endsAt: bookings.endsAt,
  version: bookings.version,
  createdAt: bookings.createdAt,
};

type BookingRow = {
  id: string;
  status: BookingStatus;
  tableId: string;
  tableName: string;
  partySize: number;
  guestName: string | null;
  guestPhone: string | null;
  note: string | null;
  startsAt: Date;
  endsAt: Date;
  version: number;
  createdAt: Date;
};

const toGuestView = (row: {
  id: string;
  status: BookingStatus;
  partySize: number;
  startsAt: Date;
  endsAt: Date;
}): GuestBookingView => ({
  id: row.id,
  status: row.status,
  ...utcToLocal(row.startsAt),
  partySize: row.partySize,
  startsAt: row.startsAt.toISOString(),
  endsAt: row.endsAt.toISOString(),
});

/** Guest booking (S14) and the staff booking list (S15). Tenant-scoped per ADR 0003. */
@Injectable()
export class BookingService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly restaurantStatus: RestaurantStatusService,
  ) {}

  // --- guest -------------------------------------------------------------------------------

  /** Start times of one local day with their availability for `partySize`. */
  async slots(slug: string, date: string, partySize: number): Promise<SlotsView> {
    const restaurant = await this.guestRestaurant(slug);
    const booking = restaurant.rules.booking;
    const now = this.clock.now();
    const slotMs = booking.slotMinutes * MINUTE_MS;
    const starts = dayStartTimes(date, booking)
      .map((time) => ({ time, start: localToUtc(date, time).getTime() }))
      .filter(({ start }) => start > now.getTime());
    const { candidates, held } = await this.availability(this.db, restaurant.id, date, partySize);
    return {
      restaurant: { name: restaurant.name, slug: restaurant.slug },
      date,
      enabled: booking.enabled,
      slotMinutes: booking.slotMinutes,
      times: starts.map(({ time, start }) => ({
        time,
        free: freeTable(start, start + slotMs, candidates, held) !== undefined,
      })),
    };
  }

  /**
   * AC48–AC50: books the smallest free table that seats the party. Candidates are tried in order;
   * the exclusion constraint decides races (ADR 0007), so two guests can never hold one table for
   * overlapping slots. A retried request with the same Idempotency-Key gets the same booking.
   */
  async create(
    slug: string,
    idempotencyKey: string,
    input: BookingInput,
  ): Promise<GuestBookingView> {
    const restaurant = await this.guestRestaurant(slug);
    const replay = await this.findByKey(restaurant.id, idempotencyKey);
    if (replay) return replay;

    const now = this.clock.now();
    const slot = checkSlot(input.date, input.time, restaurant.rules.booking, now);
    if (!slot.ok) {
      throw new DomainError(BookingErrorCode.NotAllowed, 422, {
        detail: 'Không đặt được giờ này',
        extensions: { reason: slot.reason },
      });
    }

    try {
      const created = await this.withDeadlockRetry(() =>
        this.db.transaction(async (tx) => {
          // One booking at a time per restaurant: concurrent inserts checked by the GiST
          // exclusion constraint can deadlock repeatedly (AC50 under load answered 500). Bookings
          // per restaurant are a few per minute, so serialising costs nothing; the constraint stays
          // the guarantee. Taken before the per-phone lock, always in this order.
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtext(${`booking-create:${restaurant.id}`}))`,
          );
          await this.assertPhoneUnderLimit(tx, restaurant.id, input.phone, now);
          const { candidates, held } = await this.availability(
            tx,
            restaurant.id,
            input.date,
            input.partySize,
          );
          const free = (table: SeatedTable) =>
            freeTable(slot.start.getTime(), slot.end.getTime(), [table], held) !== undefined;
          for (const table of candidates.filter(free)) {
            const row = await this.tryInsert(tx, restaurant.id, table.id, idempotencyKey, input, {
              start: slot.start,
              end: slot.end,
              now,
            });
            if (row) {
              await publish(tx, {
                restaurantId: restaurant.id,
                topic: 'floor',
                type: 'booking.status',
                data: { bookingId: row.id, status: row.status, version: 1, tableId: table.id },
              });
              return row;
            }
          }
          return undefined;
        }),
      );
      if (created) return toGuestView(created);
    } catch (error: unknown) {
      // The same key raced in from a parallel retry: answer with the booking that won.
      if (pgCode(error) === UNIQUE_VIOLATION && pgConstraint(error) === IDEMPOTENCY_KEY) {
        const winner = await this.findByKey(restaurant.id, idempotencyKey);
        if (winner) return winner;
      }
      throw error;
    }
    throw await this.noTableFree(restaurant, input, slot.start.getTime());
  }

  // --- staff -------------------------------------------------------------------------------

  /** One local day's bookings in time order (S15); today in Vietnam when no date is given. */
  async list(
    tenant: TenantId,
    day: string | undefined,
  ): Promise<{ date: string; items: BookingView[] }> {
    const now = this.clock.now();
    const date = day ?? utcToLocal(now).date;
    const { from, to } = localDayBounds(date);
    const rows = await this.db
      .select(bookingColumns)
      .from(bookings)
      .innerJoin(
        diningTables,
        and(
          eq(diningTables.restaurantId, bookings.restaurantId),
          eq(diningTables.id, bookings.tableId),
        ),
      )
      .where(
        and(
          eq(bookings.restaurantId, tenant),
          gte(bookings.startsAt, from),
          lt(bookings.startsAt, to),
        ),
      )
      .orderBy(asc(bookings.startsAt), asc(diningTables.name), asc(bookings.id))
      .limit(DAY_LIST_MAX);
    return { date, items: rows.map((row) => this.toView(row, now)) };
  }

  /** AC51: confirms the booking, optionally moving it to another table (same constraint). */
  async confirm(tenant: TenantId, id: string, tableId: string | undefined): Promise<BookingView> {
    try {
      return await this.transition(tenant, id, 'confirm', async (tx, current) => {
        if (tableId === undefined || tableId === current.tableId) return {};
        if (!isUuid(tableId)) throw notFound();
        const [table] = await tx
          .select({ seats: diningTables.seats })
          .from(diningTables)
          .where(
            and(
              eq(diningTables.restaurantId, tenant),
              eq(diningTables.id, tableId),
              // A hidden table (TQR-024) takes no bookings.
              isNull(diningTables.archivedAt),
            ),
          )
          .limit(1);
        if (!table) throw notFound();
        if (table.seats < current.partySize) {
          throw new DomainError(BookingErrorCode.TableTooSmall, 422, {
            detail: 'Bàn này không đủ chỗ',
          });
        }
        return { tableId };
      });
    } catch (error: unknown) {
      if (pgCode(error) === EXCLUSION_VIOLATION && pgConstraint(error) === NO_OVERLAP) {
        throw new DomainError(BookingErrorCode.TableBusy, 409, {
          detail: 'Bàn này đã có khách đặt trùng giờ',
        });
      }
      throw error;
    }
  }

  /** AC52: seats the party: opens a session at the booked table with the booked party size. */
  async seat(tenant: TenantId, id: string): Promise<BookingView> {
    try {
      return await this.transition(tenant, id, 'seat', async (tx, current) => {
        // A table hidden after the booking was made (TQR-024) seats nobody: 404 like staff open;
        // staff move the booking to a shown table first. The row lock is the one archive takes.
        const [table] = await tx
          .select({ id: diningTables.id })
          .from(diningTables)
          .where(
            and(
              eq(diningTables.restaurantId, tenant),
              eq(diningTables.id, current.tableId),
              isNull(diningTables.archivedAt),
            ),
          )
          .limit(1)
          .for('update');
        if (!table) throw notFound();
        const [session] = await tx
          .insert(tableSessions)
          .values({
            restaurantId: tenant,
            tableId: current.tableId,
            partySize: current.partySize,
            openedBy: 'booking',
            bookingId: current.id,
            openedAt: this.clock.now(),
          })
          .returning({ id: tableSessions.id });
        return { sessionId: session?.id };
      });
    } catch (error: unknown) {
      if (pgCode(error) === UNIQUE_VIOLATION && pgConstraint(error) === ONE_OPEN_SESSION) {
        throw new DomainError(BookingErrorCode.TableHasOpenSession, 409, {
          detail: 'Bàn này đang có khách',
        });
      }
      throw error;
    }
  }

  cancel(tenant: TenantId, id: string): Promise<BookingView> {
    return this.transition(tenant, id, 'cancel', () => Promise.resolve({}));
  }

  /** Only once the start time has passed: before that the guest may still come. */
  noShow(tenant: TenantId, id: string): Promise<BookingView> {
    return this.transition(tenant, id, 'no_show', (_tx, current) => {
      if (this.clock.now().getTime() < current.startsAt.getTime()) {
        throw new DomainError(BookingErrorCode.TooEarlyForNoShow, 409, {
          detail: 'Chưa đến giờ đặt',
        });
      }
      return Promise.resolve({});
    });
  }

  /**
   * docs/security.md: erases guest name, phone and note 30 days after the slot ended, for every
   * restaurant at once (a system job, not a tenant request). Returns how many bookings it erased.
   */
  async purgeExpiredPersonalData(now: Date = this.clock.now()): Promise<number> {
    const erased = await this.db
      .update(bookings)
      .set({ guestName: null, guestPhone: null, note: null, personalDataErasedAt: now })
      .where(and(isNotNull(bookings.guestPhone), lt(bookings.endsAt, retentionCutoff(now))))
      .returning({ id: bookings.id });
    return erased.length;
  }

  // --- internals ---------------------------------------------------------------------------

  /**
   * Candidates are tried in one global order, so two guests should never lock tables crosswise;
   * should Postgres still report a deadlock (40P01), the loser retries (up to 3 attempts) instead of a 500.
   */
  private async withDeadlockRetry<T>(work: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await work();
      } catch (error: unknown) {
        if (pgCode(error) !== DEADLOCK || attempt >= DEADLOCK_ATTEMPTS) throw error;
      }
    }
  }

  /** The restaurant behind a public slug; unknown → 404, suspended → 403 "Nhà hàng tạm ngưng". */
  private async guestRestaurant(slug: string): Promise<GuestRestaurant> {
    const [row] = await this.db
      .select({
        id: restaurants.id,
        name: restaurants.name,
        slug: restaurants.slug,
        rules: restaurants.rules,
      })
      .from(restaurants)
      .where(eq(restaurants.slug, slug))
      .limit(1);
    if (!row) throw notFound();
    const id = asTenantId(row.id);
    await this.restaurantStatus.assertActive(id);
    return { id, name: row.name, slug: row.slug, rules: readStoredRules(row.rules) };
  }

  private async findByKey(tenant: TenantId, key: string): Promise<GuestBookingView | undefined> {
    const [row] = await this.db
      .select({
        id: bookings.id,
        status: bookings.status,
        partySize: bookings.partySize,
        startsAt: bookings.startsAt,
        endsAt: bookings.endsAt,
      })
      .from(bookings)
      .where(and(eq(bookings.restaurantId, tenant), eq(bookings.idempotencyKey, key)))
      .limit(1);
    return row ? toGuestView(row) : undefined;
  }

  /** At most 5 bookings per phone per restaurant in 24 h; serialised per phone by an xact lock. */
  private async assertPhoneUnderLimit(
    tx: Executor,
    tenant: TenantId,
    phone: string,
    now: Date,
  ): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`booking:${tenant}:${phone}`}))`);
    const [recent] = await tx
      .select({ n: count() })
      .from(bookings)
      .where(
        and(
          eq(bookings.restaurantId, tenant),
          eq(bookings.guestPhone, phone),
          gt(bookings.createdAt, new Date(now.getTime() - DAY_MS)),
        ),
      );
    if ((recent?.n ?? 0) >= BOOKING_LIMITS.perPhonePerDay) {
      throw new DomainError(BookingErrorCode.TooManyBookings, 409, {
        detail: 'Số điện thoại này đã đặt đủ 5 lần hôm nay',
      });
    }
  }

  /** Tables that fit the party (smallest first) and the active bookings around that local day. */
  private async availability(
    executor: Executor,
    tenant: TenantId,
    date: string,
    partySize: number,
  ): Promise<{ candidates: SeatedTable[]; held: HeldRange[] }> {
    const tables = await executor
      .select({ id: diningTables.id, seats: diningTables.seats })
      .from(diningTables)
      .where(
        and(
          eq(diningTables.restaurantId, tenant),
          gte(diningTables.seats, partySize),
          isNull(diningTables.archivedAt),
        ),
      )
      .orderBy(asc(diningTables.seats), asc(diningTables.name), asc(diningTables.id));
    const candidates = candidateTables(tables, partySize);
    if (candidates.length === 0) return { candidates, held: [] };
    // A slot can start late in the day and end after midnight; widen the window by a day.
    const { from, to } = localDayBounds(date);
    const rows = await executor
      .select({ tableId: bookings.tableId, start: bookings.startsAt, end: bookings.endsAt })
      .from(bookings)
      .where(
        and(
          eq(bookings.restaurantId, tenant),
          inArray(bookings.status, [...ACTIVE_STATUSES]),
          inArray(
            bookings.tableId,
            candidates.map((table) => table.id),
          ),
          lt(bookings.startsAt, new Date(to.getTime() + DAY_MS)),
          gt(bookings.endsAt, new Date(from.getTime() - DAY_MS)),
        ),
      );
    return {
      candidates,
      held: rows.map((row) => ({
        tableId: row.tableId,
        start: row.start.getTime(),
        end: row.end.getTime(),
      })),
    };
  }

  /** Inserts in a savepoint; an overlap (another guest won the table) returns undefined. */
  private async tryInsert(
    tx: Tx,
    tenant: TenantId,
    tableId: string,
    idempotencyKey: string,
    input: BookingInput,
    at: { start: Date; end: Date; now: Date },
  ): Promise<
    | { id: string; status: BookingStatus; partySize: number; startsAt: Date; endsAt: Date }
    | undefined
  > {
    try {
      return await tx.transaction(async (savepoint) => {
        const [row] = await savepoint
          .insert(bookings)
          .values({
            restaurantId: tenant,
            tableId,
            partySize: input.partySize,
            guestName: input.name,
            guestPhone: input.phone,
            note: input.note,
            startsAt: at.start,
            endsAt: at.end,
            idempotencyKey,
            createdAt: at.now,
          })
          .returning({
            id: bookings.id,
            status: bookings.status,
            partySize: bookings.partySize,
            startsAt: bookings.startsAt,
            endsAt: bookings.endsAt,
          });
        return row;
      });
    } catch (error: unknown) {
      if (pgCode(error) === EXCLUSION_VIOLATION && pgConstraint(error) === NO_OVERLAP) {
        return undefined;
      }
      throw error;
    }
  }

  private async noTableFree(
    restaurant: GuestRestaurant,
    input: BookingInput,
    requested: number,
  ): Promise<DomainError> {
    const booking = restaurant.rules.booking;
    const now = this.clock.now().getTime();
    const starts = dayStartTimes(input.date, booking)
      .map((time) => localToUtc(input.date, time).getTime())
      .filter((start) => start > now);
    const { candidates, held } = await this.availability(
      this.db,
      restaurant.id,
      input.date,
      input.partySize,
    );
    const nearest = nearestFreeStarts(
      requested,
      starts,
      booking.slotMinutes * MINUTE_MS,
      candidates,
      held,
    ).map((start) => utcToLocal(new Date(start)));
    return new DomainError(BookingErrorCode.NoTableFree, 409, {
      detail: 'Hết bàn trống vào giờ này',
      extensions: { nearest },
    });
  }

  /**
   * One staff action in one transaction: lock the row, check the status move, apply the action's
   * extra work, bump the version and publish `booking.status` on the floor topic (ADR 0004).
   */
  private async transition(
    tenant: TenantId,
    id: string,
    action: BookingAction,
    apply: (tx: Tx, current: BookingRow) => Promise<{ tableId?: string; sessionId?: string }>,
  ): Promise<BookingView> {
    if (!isUuid(id)) throw notFound();
    const row = await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select(bookingColumns)
        .from(bookings)
        .innerJoin(
          diningTables,
          and(
            eq(diningTables.restaurantId, bookings.restaurantId),
            eq(diningTables.id, bookings.tableId),
          ),
        )
        .where(and(eq(bookings.restaurantId, tenant), eq(bookings.id, id)))
        .limit(1)
        .for('update', { of: bookings });
      if (!current) throw notFound();
      const status = nextStatus(current.status, action);
      if (status === null) throw wrongStatus(current.status);
      const extra = await apply(tx, current);
      const tableId = extra.tableId ?? current.tableId;
      const [updated] = await tx
        .update(bookings)
        .set({ status, tableId, version: sql`${bookings.version} + 1` })
        .where(and(eq(bookings.restaurantId, tenant), eq(bookings.id, id)))
        .returning({ version: bookings.version });
      if (!updated) throw notFound();
      await publish(tx, {
        restaurantId: tenant,
        topic: 'floor',
        type: 'booking.status',
        data: {
          bookingId: id,
          status,
          version: updated.version,
          tableId,
          sessionId: extra.sessionId ?? null,
        },
      });
      return { id };
    });
    const [fresh] = await this.db
      .select(bookingColumns)
      .from(bookings)
      .innerJoin(
        diningTables,
        and(
          eq(diningTables.restaurantId, bookings.restaurantId),
          eq(diningTables.id, bookings.tableId),
        ),
      )
      .where(and(eq(bookings.restaurantId, tenant), eq(bookings.id, row.id)))
      .limit(1);
    if (!fresh) throw notFound();
    return this.toView(fresh, this.clock.now());
  }

  private toView(row: BookingRow, now: Date): BookingView {
    return {
      id: row.id,
      status: row.status,
      tableId: row.tableId,
      tableName: row.tableName,
      partySize: row.partySize,
      guestName: row.guestName,
      guestPhone: row.guestPhone,
      note: row.note,
      ...utcToLocal(row.startsAt),
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      late: isLate(row.status, row.startsAt, now),
      lateAt: lateAt(row.startsAt).toISOString(),
      version: row.version,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
