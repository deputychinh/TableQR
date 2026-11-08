import type { INestApplication } from '@nestjs/common';
import type { Express } from 'express';
import { AppLogger } from './common/logging/app-logger.js';
import { ProblemFilter } from './common/errors/problem.filter.js';
import { bodyErrorHandler, jsonBodyParser } from './common/http/body-parser.js';
import { securityHeadersMiddleware } from './common/http/security-headers.js';
import { requestLogMiddleware } from './common/logging/request-log.middleware.js';
import { SETTINGS, type Settings } from './config/settings.js';

export const API_PREFIX = 'api';

/** Everything main.ts and the e2e tests must share, so tests exercise the real configuration. */
export const configureApp = (app: INestApplication): void => {
  const logger = app.get(AppLogger);
  const settings = app.get<Settings>(SETTINGS);
  const express = app.getHttpAdapter().getInstance() as Express;
  express.disable('x-powered-by');
  // Only the listed proxies may set the client address (the rate-limit key); none by default.
  const proxies = settings.TQR_TRUSTED_PROXIES;
  express.set('trust proxy', proxies.length > 0 ? proxies : false);
  app.setGlobalPrefix(API_PREFIX);
  // First, so every answer carries the headers: problem details, 404s and event streams too.
  app.use(securityHeadersMiddleware({ hsts: settings.TQR_HSTS }));
  app.use(requestLogMiddleware(logger));
  app.use(jsonBodyParser);
  app.use(bodyErrorHandler);
  app.useGlobalFilters(new ProblemFilter(logger));
  app.enableShutdownHooks();
};
