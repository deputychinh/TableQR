import { ErrorCode } from './error-code.enum.js';

/** An expected failure of a use case: carries a stable code and the HTTP status it maps to. */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode | string,
    readonly status: number,
    message: string = code,
    readonly detail?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
