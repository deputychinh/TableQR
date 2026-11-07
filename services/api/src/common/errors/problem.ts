import { STATUS_CODES } from 'node:http';
import { ErrorCode } from './error-code.enum.js';

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';
const TYPE_BASE = 'https://tableqr.local/problems/';

export interface Problem {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: Readonly<Record<string, unknown>>;
}

const DEFAULT_CODE_BY_STATUS: Readonly<Record<number, ErrorCode>> = {
  400: ErrorCode.BadRequest,
  401: ErrorCode.Unauthorized,
  403: ErrorCode.Forbidden,
  404: ErrorCode.NotFound,
  409: ErrorCode.Conflict,
  413: ErrorCode.PayloadTooLarge,
  429: ErrorCode.TooManyRequests,
  503: ErrorCode.DbUnavailable,
};

/** Builds an RFC 9457 problem; the title is the generic HTTP reason, never an internal message. */
export const toProblem = (
  status: number,
  code?: string,
  detail?: Readonly<Record<string, unknown>>,
): Problem => {
  const resolvedCode = code ?? DEFAULT_CODE_BY_STATUS[status] ?? ErrorCode.Internal;
  return {
    type: `${TYPE_BASE}${resolvedCode.toLowerCase().replaceAll('_', '-')}`,
    title: STATUS_CODES[status] ?? 'Error',
    status,
    code: resolvedCode,
    ...(detail ? { detail } : {}),
  };
};
