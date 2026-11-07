import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { parseBody } from '../common/http/validate.js';
import { AuthService, type Me, type Principal } from './auth.service.js';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './domain/password.js';
import { CurrentPrincipal, Roles, StaffGuard } from './guards.js';
import {
  STAFF_COOKIE,
  clearSessionCookie,
  readCookie,
  setSessionCookie,
} from './session.cookie.js';
import { hashToken } from './domain/session-token.js';

const email = z.string().trim().email().max(254);
const signUpSchema = z
  .object({
    restaurantName: z.string().trim().min(2).max(80),
    email,
    password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
  })
  .strict();
const loginSchema = z
  .object({ email, password: z.string().min(1).max(MAX_PASSWORD_LENGTH) })
  .strict();

const ALL_STAFF = ['owner', 'cashier', 'waiter', 'kitchen', 'platform_admin'] as const;

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('auth/signup')
  @HttpCode(201)
  async signUp(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Me> {
    const input = parseBody(signUpSchema, body);
    const session = await this.auth.signUp(input);
    setSessionCookie(request, response, session.token, session.expiresAt);
    const principal = await this.auth.authenticate(session.token);
    if (!principal) throw new Error('session just issued could not be read');
    return this.auth.me(principal);
  }

  @Post('auth/login')
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Me> {
    const input = parseBody(loginSchema, body);
    const previous = readCookie(request, STAFF_COOKIE);
    if (previous) await this.auth.logout(hashToken(previous)); // rotate on sign-in
    const session = await this.auth.login(input);
    setSessionCookie(request, response, session.token, session.expiresAt);
    const principal = await this.auth.authenticate(session.token);
    if (!principal) throw new Error('session just issued could not be read');
    return this.auth.me(principal);
  }

  @Post('auth/logout')
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token = readCookie(request, STAFF_COOKIE);
    if (token) await this.auth.logout(hashToken(token));
    clearSessionCookie(request, response);
  }

  @Get('me')
  @UseGuards(StaffGuard)
  @Roles(...ALL_STAFF)
  me(@CurrentPrincipal() principal: Principal): Promise<Me> {
    return this.auth.me(principal);
  }
}
