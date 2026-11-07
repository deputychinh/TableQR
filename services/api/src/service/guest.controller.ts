import { Body, Controller, Get, Header, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { parseBody } from '../common/http/validate.js';
import { MenuService, type GuestMenu } from '../menu/menu.service.js';
import { RealtimeHub } from '../realtime/realtime.hub.js';
import { openStream } from '../realtime/sse.js';
import { CART_LIMITS, parseIdempotencyKey } from './domain/ordering.js';
import { idempotencyKeyRequired } from './domain/service-errors.js';
import { readGuestCookie, setGuestCookie } from './guest.cookie.js';
import { OrdersService, type OrderView } from './orders.service.js';
import { SessionsService, type GuestSessionView, type SessionView } from './sessions.service.js';

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
    private readonly hub: RealtimeHub,
  ) {}

  /** AC17–AC19: check in (open with party size) or join the table's open session. */
  @Post('session')
  @HttpCode(200)
  async checkIn(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<{ session: SessionView; opened: boolean }> {
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
    const context = await this.sessions.guestContext(readGuestCookie(request));
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
    const context = await this.sessions.guestContext(readGuestCookie(request));
    await openStream(this.hub, request, response, {
      restaurantId: context.tenant,
      topics: [`session:${context.sessionId}`],
      snapshot: () => this.sessions.guestView(context),
    });
  }
}
