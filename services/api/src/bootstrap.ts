import type { INestApplication } from '@nestjs/common';
import { AppLogger } from './common/logging/app-logger.js';
import { ProblemFilter } from './common/errors/problem.filter.js';
import { bodyErrorHandler, jsonBodyParser } from './common/http/body-parser.js';
import { requestLogMiddleware } from './common/logging/request-log.middleware.js';

export const API_PREFIX = 'api';

/** Everything main.ts and the e2e tests must share, so tests exercise the real configuration. */
export const configureApp = (app: INestApplication): void => {
  const logger = app.get(AppLogger);
  app.setGlobalPrefix(API_PREFIX);
  app.use(requestLogMiddleware(logger));
  app.use(jsonBodyParser);
  app.use(bodyErrorHandler);
  app.useGlobalFilters(new ProblemFilter(logger));
  app.enableShutdownHooks();
};
