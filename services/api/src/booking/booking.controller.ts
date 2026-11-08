import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { ErrorCode } from '../common/enums/error-code.enum.js';
import { DomainError } from '../common/errors/domain.error.js';
import { RequestLimits, clientAddress } from '../common/http/request-limits.js';
import { parseBody } from '../common/http/validate.js';
import { tenantOf } from '../common/tenant.js';
import type { Principal } from '../identity/auth.service.js';
import { CurrentPrincipal, Roles, StaffGuard } from '../identity/guards.js';
import {
  BookingService,
  type BookingView,
  type GuestBookingView,
  type SlotsView,
} from './booking.service.js';
import {
  BOOKING_LIMITS,
  charLength,
  isValidGuestName,
  isValidIdempotencyKey,
  normalizeGuestName,
} from './domain/booking-rules.js';
import { normalizeVnMobile } from './domain/phone.js';
import { isLocalDate, isLocalTime } from './domain/slots.js';

const SLUG = /^[a-z0-9-]{1,80}$/u;
const { party, noteMax } = BOOKING_LIMITS;

const partySize = z.number().int().min(party.min).max(party.max);
const localDate = z.string().refine(isLocalDate, { message: 'not_a_date' });

const bookingSchema = z
  .object({
    date: localDate,
    time: z.string().refine(isLocalTime, { message: 'not_a_time' }),
    partySize,
    name: z.string().max(200).transform(normalizeGuestName).refine(isValidGuestName),
    phone: z
      .string()
      .max(40)
      .transform((value, context) => {
        const phone = normalizeVnMobile(value);
        if (phone === null) {
          context.addIssue({ code: 'custom', message: 'not_a_vn_mobile' });
          return z.NEVER;
        }
        return phone;
      }),
    note: z
      .string()
      .transform((value) => value.trim())
      .refine((value) => charLength(value) <= noteMax, { message: 'too_long' })
      .transform((value) => (value === '' ? null : value))
      .optional()
      .transform((value) => value ?? null),
  })
  .strict();

const confirmSchema = z.object({ tableId: z.string().max(64).optional() }).strict();

const invalid = (path: string): DomainError =>
  new DomainError(ErrorCode.ValidationFailed, 422, {
    extensions: { fields: [{ path, code: 'invalid' }] },
  });

const checkSlug = (slug: string): void => {
  if (!SLUG.test(slug)) throw new DomainError(ErrorCode.NotFound, 404);
};

/**
 * Public booking page API (S14). The restaurant is public information, so the tenant comes from
 * the slug; a suspended restaurant answers "Nhà hàng tạm ngưng" (AC54).
 */
@Controller('g/r')
export class GuestBookingController {
  constructor(
    private readonly booking: BookingService,
    private readonly limits: RequestLimits,
  ) {}

  @Get(':slug/slots')
  @Header('Cache-Control', 'no-store')
  slots(
    @Param('slug') slug: string,
    @Query('date') date: unknown,
    @Query('party') partyParam: unknown,
  ): Promise<SlotsView> {
    checkSlug(slug);
    if (typeof date !== 'string' || !isLocalDate(date)) throw invalid('date');
    const size = partyParam === undefined ? party.min : Number(partyParam);
    if (!partySize.safeParse(size).success) throw invalid('party');
    return this.booking.slots(slug, date, size);
  }

  @Post(':slug/bookings')
  @HttpCode(201)
  create(
    @Req() request: Request,
    @Param('slug') slug: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: unknown,
  ): Promise<GuestBookingView> {
    checkSlug(slug);
    // Public form: 10 requests per hour per client address (docs/security.md, TQR-020).
    this.limits.take('public_booking', clientAddress(request));
    if (key === undefined || !isValidIdempotencyKey(key)) throw invalid('Idempotency-Key');
    return this.booking.create(slug, key, parseBody(bookingSchema, body));
  }
}

/** Staff booking list and actions (S15): owner, cashier and waiter; never the kitchen. */
@Controller('bookings')
@UseGuards(StaffGuard)
@Roles('owner', 'cashier', 'waiter')
export class BookingController {
  constructor(private readonly booking: BookingService) {}

  /** `?date=YYYY-MM-DD` (local); today in Vietnam when omitted. */
  @Get()
  @Header('Cache-Control', 'no-store')
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query('date') date: unknown,
  ): Promise<{ date: string; items: BookingView[] }> {
    if (date !== undefined && (typeof date !== 'string' || !isLocalDate(date))) {
      throw invalid('date');
    }
    return this.booking.list(tenantOf(principal), date);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  confirm(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<BookingView> {
    const { tableId } = parseBody(confirmSchema, body ?? {});
    return this.booking.confirm(tenantOf(principal), id, tableId);
  }

  @Post(':id/seat')
  @HttpCode(200)
  seat(@CurrentPrincipal() principal: Principal, @Param('id') id: string): Promise<BookingView> {
    return this.booking.seat(tenantOf(principal), id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentPrincipal() principal: Principal, @Param('id') id: string): Promise<BookingView> {
    return this.booking.cancel(tenantOf(principal), id);
  }

  @Post(':id/no-show')
  @HttpCode(200)
  noShow(@CurrentPrincipal() principal: Principal, @Param('id') id: string): Promise<BookingView> {
    return this.booking.noShow(tenantOf(principal), id);
  }
}
