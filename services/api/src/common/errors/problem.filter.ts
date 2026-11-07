import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppLogger } from '../logging/app-logger.js';
import { requestIdOf } from '../logging/request-id.js';
import { DomainError } from './domain.error.js';
import { ErrorCode } from './error-code.enum.js';
import { PROBLEM_CONTENT_TYPE, toProblem, type Problem } from './problem.js';

const INTERNAL_STATUS = 500;

const codeFromHttpException = (exception: HttpException): string | undefined => {
  const body = exception.getResponse();
  if (typeof body === 'object' && 'code' in body && typeof body.code === 'string') {
    return body.code;
  }
  return undefined;
};

/** The one place where errors become HTTP: domain errors and Nest exceptions map to RFC 9457. */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    let problem: Problem;
    if (exception instanceof DomainError) {
      problem = toProblem(exception.status, exception.code, exception.detail);
    } else if (exception instanceof HttpException) {
      problem = toProblem(exception.getStatus(), codeFromHttpException(exception));
    } else {
      problem = toProblem(INTERNAL_STATUS, ErrorCode.Internal);
    }
    if (problem.status >= INTERNAL_STATUS) {
      this.logger.error('unhandled_error', {
        reqId: requestIdOf(request),
        error: exception instanceof Error ? exception.name : typeof exception,
        message: exception instanceof Error ? exception.message : undefined,
        cause:
          exception instanceof Error && exception.cause instanceof Error
            ? exception.cause.message
            : undefined,
      });
    }
    response.status(problem.status).type(PROBLEM_CONTENT_TYPE).send(JSON.stringify(problem));
  }
}
