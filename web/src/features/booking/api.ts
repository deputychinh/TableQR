import { ApiError, getJson, sendJson } from '@/api/client';

export type BookingStatus = 'pending' | 'confirmed' | 'seated' | 'cancelled' | 'no_show';

/** `GET /api/g/r/:slug/slots?date=&party=` */
export interface SlotsView {
  restaurant: { name: string; slug: string };
  date: string;
  enabled: boolean;
  slotMinutes: number;
  times: { time: string; free: boolean }[];
}

export interface BookingRequest {
  date: string;
  time: string;
  partySize: number;
  name: string;
  phone: string;
  note?: string;
}

/** What the guest gets back (`POST /api/g/r/:slug/bookings`). */
export interface GuestBooking {
  id: string;
  status: BookingStatus;
  date: string;
  time: string;
  partySize: number;
  startsAt: string;
  endsAt: string;
}

/** A row of the staff day list (`GET /api/bookings?date=`). */
export interface Booking {
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
  late: boolean;
  lateAt: string;
  version: number;
  createdAt: string;
}

export interface TableOption {
  id: string;
  name: string;
  seats: number;
}

const slugPath = (slug: string) => `/g/r/${encodeURIComponent(slug)}`;

export const loadSlots = (slug: string, date: string, party: number): Promise<SlotsView> =>
  getJson<SlotsView>(
    `${slugPath(slug)}/slots?date=${encodeURIComponent(date)}&party=${String(party)}`,
  );

/** A refused booking with what the problem body adds: the AC49 reason or the AC48 alternatives. */
export class BookingRefusal extends ApiError {
  constructor(
    base: ApiError,
    readonly reason: string | undefined,
    readonly nearest: { date: string; time: string }[],
  ) {
    super(base.status, base.code, base.fields, { cause: base });
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readProblem = async (response: Response): Promise<Record<string, unknown>> => {
  try {
    const body: unknown = await response.clone().json();
    return isRecord(body) ? body : {};
  } catch {
    // Not JSON (e.g. a proxy page): the shared client already maps it to a generic code.
    return {};
  }
};

/**
 * Sends the booking with an Idempotency-Key header: the same key on a retry returns the same
 * booking, so a guest who taps again after a network error is never booked twice.
 */
export const createBooking = async (
  slug: string,
  input: BookingRequest,
  idempotencyKey: string,
): Promise<GuestBooking> => {
  let problem: Record<string, unknown> = {};
  try {
    return await sendJson<GuestBooking>(
      'POST',
      `${slugPath(slug)}/bookings`,
      input,
      async (url, init) => {
        const response = await fetch(url, {
          ...init,
          headers: {
            ...(init?.headers as Record<string, string>),
            'idempotency-key': idempotencyKey,
          },
        });
        if (!response.ok) problem = await readProblem(response);
        return response;
      },
    );
  } catch (error: unknown) {
    if (!(error instanceof ApiError)) throw error;
    const nearest = Array.isArray(problem.nearest)
      ? (problem.nearest as { date: string; time: string }[])
      : [];
    const reason = typeof problem.reason === 'string' ? problem.reason : undefined;
    throw new BookingRefusal(error, reason, nearest);
  }
};

export const listBookings = (date: string): Promise<{ date: string; items: Booking[] }> =>
  getJson(`/bookings?date=${encodeURIComponent(date)}`);

export type BookingAction = 'confirm' | 'seat' | 'cancel' | 'no-show';

export const bookingAction = (
  id: string,
  action: BookingAction,
  body?: { tableId?: string },
): Promise<Booking> =>
  sendJson<Booking>('POST', `/bookings/${encodeURIComponent(id)}/${action}`, body ?? {});

/** The restaurant's tables, to pick one when confirming or moving a booking. */
export const listTableOptions = async (): Promise<TableOption[]> =>
  (await getJson<{ items: TableOption[] }>('/tables')).items;
