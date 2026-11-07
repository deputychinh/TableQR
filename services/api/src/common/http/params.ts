import { z } from 'zod';
import { ErrorCode } from '../enums/error-code.enum.js';
import { DomainError } from '../errors/domain.error.js';

const uuid = z.uuid();

/**
 * A path id. A malformed id is just an id that does not exist here (ADR 0003): 404 `NOT_FOUND`,
 * never a 422 or a Postgres cast error.
 */
export const uuidParam = (raw: string): string => {
  const parsed = uuid.safeParse(raw);
  if (!parsed.success) throw new DomainError(ErrorCode.NotFound, 404);
  return parsed.data;
};
