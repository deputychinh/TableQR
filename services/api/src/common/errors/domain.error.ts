import type { ErrorCode } from '../enums/error-code.enum.js';

export interface DomainErrorOptions {
  /** Human-readable explanation for this occurrence (RFC 9457 `detail`); never internal data. */
  detail?: string;
  /** Structured, client-safe data, sent as RFC 9457 extension members (e.g. `{ field: 'email' }`). */
  extensions?: Readonly<Record<string, unknown>>;
  cause?: unknown;
}

/** An expected failure of a use case: carries a stable code and the HTTP status it maps to. */
export class DomainError extends Error {
  readonly detail?: string;
  readonly extensions?: Readonly<Record<string, unknown>>;

  constructor(
    readonly code: ErrorCode | string,
    readonly status: number,
    options: DomainErrorOptions = {},
  ) {
    super(code, { cause: options.cause });
    this.name = 'DomainError';
    this.detail = options.detail;
    this.extensions = options.extensions;
  }
}
