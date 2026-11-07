import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ErrorCode } from '../enums/error-code.enum.js';
import { AppLogger } from '../logging/app-logger.js';
import { errorFields } from '../logging/error-fields.js';
import { requestIdOf } from '../logging/request-id.js';
import { DomainError } from './domain.error.js';
import { sendProblem, toProblem, type Problem } from './problem.js';

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
    const requestId = requestIdOf(request);
    let problem: Problem;
    if (exception instanceof DomainError) {
      problem = toProblem(exception.status, {
        code: exception.code,
        detail: exception.detail,
        extensions: exception.extensions,
        requestId,
      });
    } else if (exception instanceof HttpException) {
      problem = toProblem(exception.getStatus(), {
        code: codeFromHttpException(exception),
        requestId,
      });
    } else {
      problem = toProblem(INTERNAL_STATUS, { code: ErrorCode.Internal, requestId });
    }
    if (problem.status >= INTERNAL_STATUS) {
      this.logger.error('unhandled_error', { reqId: requestId, ...errorFields(exception) });
    }
    sendProblem(response, problem);
  }
}
