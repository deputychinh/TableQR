import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ErrorCode } from '../common/enums/error-code.enum.js';
import { DomainError } from '../common/errors/domain.error.js';
import { SETTINGS, type Settings } from '../config/settings.js';
import { AuthService, type Principal, type StaffRole } from './auth.service.js';
import { STAFF_COOKIE, readCookie } from './session.cookie.js';

const PRINCIPAL = Symbol('principal');
type WithPrincipal = Request & { [PRINCIPAL]?: Principal };

export const ROLES = 'tqr_roles';
/** Deny by default: a route lists the roles allowed to call it. */
export const Roles = (...roles: StaffRole[]) => SetMetadata(ROLES, roles);

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const principal = context.switchToHttp().getRequest<WithPrincipal>()[PRINCIPAL];
    if (!principal) throw new DomainError(ErrorCode.Unauthorized, 401);
    return principal;
  },
);

/** Requires a valid staff session and one of the route's roles. */
@Injectable()
export class StaffGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<WithPrincipal>();
    const token = readCookie(request, STAFF_COOKIE);
    const principal = token ? await this.auth.authenticate(token) : null;
    if (!principal) throw new DomainError(ErrorCode.Unauthorized, 401);
    const roles = this.reflector.getAllAndOverride<StaffRole[] | undefined>(ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || !roles.includes(principal.role)) throw new DomainError(ErrorCode.Forbidden, 403);
    request[PRINCIPAL] = principal;
    return true;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** CSRF defence (ADR 0002 §4): non-GET requests must come from the app's own origin. */
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(@Inject(SETTINGS) private readonly settings: Settings) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;
    const origin = request.header('origin');
    // Same-origin fetches from older browsers may omit Origin; Sec-Fetch-Site still tells us.
    if (origin === undefined) {
      const site = request.header('sec-fetch-site');
      if (site === undefined || site === 'same-origin' || site === 'none') return true;
      throw new DomainError('BAD_ORIGIN', 403);
    }
    if (this.settings.TQR_WEB_ORIGINS.includes(origin)) return true;
    throw new DomainError('BAD_ORIGIN', 403);
  }
}
