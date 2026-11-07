/** Stable error codes shared by every context; clients branch on these, never on messages. */
export enum ErrorCode {
  BadRequest = 'BAD_REQUEST',
  InvalidJson = 'INVALID_JSON',
  ValidationFailed = 'VALIDATION_FAILED',
  Unauthorized = 'UNAUTHORIZED',
  Forbidden = 'FORBIDDEN',
  NotFound = 'NOT_FOUND',
  MethodNotAllowed = 'METHOD_NOT_ALLOWED',
  UnsupportedMediaType = 'UNSUPPORTED_MEDIA_TYPE',
  Conflict = 'CONFLICT',
  PayloadTooLarge = 'PAYLOAD_TOO_LARGE',
  TooManyRequests = 'TOO_MANY_REQUESTS',
  DbUnavailable = 'DB_UNAVAILABLE',
  Internal = 'INTERNAL',
}
