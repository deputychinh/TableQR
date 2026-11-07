import express, { type NextFunction, type Request, type Response } from 'express';
import { ErrorCode } from '../errors/error-code.enum.js';
import { PROBLEM_CONTENT_TYPE, toProblem } from '../errors/problem.js';

export const JSON_BODY_LIMIT = '32kb';

const bodyErrorType = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && 'type' in error && typeof error.type === 'string'
    ? error.type
    : undefined;

/** JSON parser with a size limit; parser failures become problems before routing. */
export const jsonBodyParser = express.json({ limit: JSON_BODY_LIMIT });

export const bodyErrorHandler = (
  error: unknown,
  _request: Request,
  response: Response,
  next: NextFunction,
): void => {
  const type = bodyErrorType(error);
  const problem =
    type === 'entity.too.large'
      ? toProblem(413, ErrorCode.PayloadTooLarge)
      : type === 'entity.parse.failed'
        ? toProblem(400, ErrorCode.InvalidJson)
        : undefined;
  if (problem === undefined) {
    next(error);
    return;
  }
  response.status(problem.status).type(PROBLEM_CONTENT_TYPE).send(JSON.stringify(problem));
};
