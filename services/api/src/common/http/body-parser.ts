import express, { type NextFunction, type Request, type Response } from 'express';
import { ErrorCode } from '../enums/error-code.enum.js';
import { sendProblem, toProblem } from '../errors/problem.js';
import { requestIdOf } from '../logging/request-id.js';

export const JSON_BODY_LIMIT = '32kb';

const bodyErrorType = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && 'type' in error && typeof error.type === 'string'
    ? error.type
    : undefined;

/** JSON parser with a size limit; parser failures become problems before routing. */
export const jsonBodyParser = express.json({ limit: JSON_BODY_LIMIT });

export const bodyErrorHandler = (
  error: unknown,
  request: Request,
  response: Response,
  next: NextFunction,
): void => {
  const type = bodyErrorType(error);
  const requestId = requestIdOf(request);
  const problem =
    type === 'entity.too.large'
      ? toProblem(413, { code: ErrorCode.PayloadTooLarge, requestId })
      : type === 'entity.parse.failed'
        ? toProblem(400, { code: ErrorCode.InvalidJson, requestId })
        : type === 'encoding.unsupported' || type === 'charset.unsupported'
          ? toProblem(415, { code: ErrorCode.UnsupportedMediaType, requestId })
          : undefined;
  if (problem === undefined) {
    next(error);
    return;
  }
  sendProblem(response, problem);
};
