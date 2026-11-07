import { STATUS_CODES } from 'node:http';
import type { Response } from 'express';
import { ErrorCode } from '../enums/error-code.enum.js';

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';
const TYPE_BASE = 'https://tableqr.local/problems/';
const FIRST_SERVER_ERROR = 500;
const FIRST_CLIENT_ERROR = 400;

/** RFC 9457 members we send; extension members (e.g. `field`) sit beside them. */
export interface Problem {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  instance?: string;
  [extension: string]: unknown;
}

export interface ProblemOptions {
  code?: string;
  detail?: string;
  requestId?: string;
  extensions?: Readonly<Record<string, unknown>>;
}

const DEFAULT_CODE_BY_STATUS: Readonly<Record<number, ErrorCode>> = {
  400: ErrorCode.BadRequest,
  401: ErrorCode.Unauthorized,
  403: ErrorCode.Forbidden,
  404: ErrorCode.NotFound,
  405: ErrorCode.MethodNotAllowed,
  409: ErrorCode.Conflict,
  413: ErrorCode.PayloadTooLarge,
  415: ErrorCode.UnsupportedMediaType,
  422: ErrorCode.ValidationFailed,
  429: ErrorCode.TooManyRequests,
  503: ErrorCode.DbUnavailable,
};

const RESERVED = new Set(['type', 'title', 'status', 'code', 'detail', 'instance']);

const defaultCode = (status: number): string =>
  DEFAULT_CODE_BY_STATUS[status] ??
  (status >= FIRST_CLIENT_ERROR && status < FIRST_SERVER_ERROR
    ? ErrorCode.BadRequest
    : ErrorCode.Internal);

/** Builds an RFC 9457 problem; the title is the generic HTTP reason, never an internal message. */
export const toProblem = (status: number, options: ProblemOptions = {}): Problem => {
  const code = options.code ?? defaultCode(status);
  const extensions = Object.fromEntries(
    Object.entries(options.extensions ?? {}).filter(([key]) => !RESERVED.has(key)),
  );
  return {
    ...extensions,
    type: `${TYPE_BASE}${code.toLowerCase().replaceAll('_', '-')}`,
    title: STATUS_CODES[status] ?? 'Error',
    status,
    code,
    ...(options.detail === undefined ? {} : { detail: options.detail }),
    ...(options.requestId === undefined
      ? {}
      : { instance: `urn:tableqr:request:${options.requestId}` }),
  };
};

/** The single writer of problem responses; does nothing when headers are already out (streams). */
export const sendProblem = (response: Response, problem: Problem): void => {
  if (response.headersSent) {
    response.end();
    return;
  }
  response.status(problem.status).type(PROBLEM_CONTENT_TYPE).send(JSON.stringify(problem));
};
