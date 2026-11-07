import type { NextFunction, Request, Response } from 'express';
import type { AppLogger } from './app-logger.js';
import { assignRequestId } from './request-id.js';

const NS_PER_MS = 1_000_000n;

/** Route pattern (`/api/tables/:id`), never the raw URL: paths and queries can carry QR tokens. */
const routeOf = (request: Request): string => {
  const route: unknown = request.route;
  if (
    typeof route === 'object' &&
    route !== null &&
    'path' in route &&
    typeof route.path === 'string' &&
    !route.path.includes('*') // Nest's not-found catch-all (`/api*path`) is not a real route
  ) {
    return `${request.baseUrl}${route.path}`;
  }
  return '(unmatched)';
};

export const requestLogMiddleware =
  (logger: AppLogger) =>
  (request: Request, response: Response, next: NextFunction): void => {
    const started = process.hrtime.bigint();
    const reqId = assignRequestId(request, request.header('x-request-id'));
    response.setHeader('x-request-id', reqId);
    response.on('finish', () => {
      logger.info('request', {
        reqId,
        method: request.method,
        route: routeOf(request),
        status: response.statusCode,
        ms: Number((process.hrtime.bigint() - started) / NS_PER_MS),
      });
    });
    next();
  };
