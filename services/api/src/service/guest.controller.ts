import { Body, Controller, Get, Header, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { RequestLimits, clientAddress } from '../common/http/request-limits.js';
import { parseBody } from '../common/http/validate.js';
import { hashToken } from '../identity/domain/session-token.js';
import { MenuService, type GuestMenu } from '../menu/menu.service.js';
import { StreamGate, stillAllowed } from '../realtime/stream-gate.js';
import { CART_LIMITS, parseIdempotencyKey } from './domain/ordering.js';
import { idempotencyKeyRequired } from './domain/service-errors.js';
import { readGuestCookie, setGuestCookie } from './guest.cookie.js';
import { OrdersService, type OrderView } from './orders.service.js';
import {
  SessionsService,
  type CheckInNext,
  type GuestSessionView,
  type SessionView,
} from './sessions.service.js';

const checkInSchema = z
  .object({
    qrToken: z.string().min(1).max(64),
    partySize: z.number().int().optional(),
  })
  .strict();

const note = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().max(CART_LIMITS.maxNoteLength))
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional()
  .transform((value) => value ?? null);

const orderSchema = z
  .object({
    lines: z
      .array(
        z
          .object({
            menuItemId: z.uuid(),
            quantity: z.number().int().min(CART_LIMITS.minQuantity).max(CART_LIMITS.maxQuantity),
            priceVnd: z.number().int().positive(),
            note,
          })
          .strict(),
      )
      .min(CART_LIMITS.minLines)
      .max(CART_LIMITS.maxLines),
  })
  .strict();

/**
 * Guest endpoints (no login): the tenant and session come from the QR token at check-in and from
 * the `tqr_guest` cookie afterwards — never from a path or body id (ADR 0003).
 */
@Controller('g')
export class GuestController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly orders: OrdersService,
    private readonly menu: MenuService,
    private readonly streams: StreamGate,
    private readonly limits: RequestLimits,
  ) {}

  /**
   * TQR-011: what scanning `qr` leads to (join, party size, wait for staff), asked before check-in
   * so the page never meets an expected 409 on load.
   */
  @Get('check-in')
  @Header('Cache-Control', 'no-store')
  checkInNext(@Query('qr') qr: unknown): Promise<CheckInNext> {
    const qrToken = parseBody(checkInSchema, { qrToken: typeof qr === 'string' ? qr : '' }).qrToken;
    return this.sessions.checkInNext(qrToken);
  }

  /** AC17–AC19: check in (open with party size) or join the table's open session. */
  @Post('session')
  @HttpCode(200)
  async checkIn(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<{ session: SessionView; opened: boolean }> {
    this.limits.take('guest_check_in', clientAddress(request));
    const input = parseBody(checkInSchema, body);
    const result = await this.sessions.checkIn(
      input.qrToken,
      input.partySize,
      readGuestCookie(request),
    );
    if (result.deviceToken) setGuestCookie(request, response, result.deviceToken);
    if (result.opened) response.status(201);
    return { session: result.session, opened: result.opened };
  }

  @Get('session')
  @Header('Cache-Control', 'no-store')
  async view(@Req() request: Request): Promise<GuestSessionView> {
    return this.sessions.guestView(await this.sessions.guestContext(readGuestCookie(request)));
  }

  /** The menu of the phone's restaurant (same shape as `GET /api/g/r/:slug/menu`). */
  @Get('menu')
  @Header('Cache-Control', 'no-store')
  async guestMenu(@Req() request: Request): Promise<GuestMenu> {
    const context = await this.sessions.guestContext(readGuestCookie(request));
    return this.menu.guestMenu(await this.sessions.slugOf(context.tenant));
  }

  /** AC22–AC25: submit a cart once per `Idempotency-Key`; a retry answers 200 with the same order. */
  @Post('orders')
  async placeOrder(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<OrderView> {
    const cookie = readGuestCookie(request);
    const context = await this.sessions.guestContext(cookie);
    // docs/security.md: 20 orders / 10 min per phone (429 TOO_MANY_ORDERS); the cookie is known here.
    this.limits.take('guest_order', hashToken(cookie ?? ''));
    const key = parseIdempotencyKey(request.headers['idempotency-key']);
    if (!key) throw idempotencyKeyRequired();
    const input = parseBody(orderSchema, body);
    const result = await this.orders.place(context.tenant, context.sessionId, key, input.lines);
    response.status(result.created ? 201 : 200);
    return result.order;
  }

  /** AC38/AC39: live statuses of the session; snapshot on every (re)connect (ADR 0004). */
  @Get('stream')
  async stream(@Req() request: Request, @Res() response: Response): Promise<void> {
    const cookie = readGuestCookie(request);
    const context = await this.sessions.guestContext(cookie);
    const audience = {
      tenant: context.tenant,
      sessionId: context.sessionId,
      isStillAllowed: stillAllowed(() => this.sessions.guestContext(cookie)),
    };
    await this.streams.openGuest(audience, request, response, {
      topics: [`session:${context.sessionId}`],
      snapshot: () => this.sessions.guestView(context),
    });
  }
}
