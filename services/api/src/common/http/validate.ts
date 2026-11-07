import type { z } from 'zod';
import { ErrorCode } from '../enums/error-code.enum.js';
import { DomainError } from '../errors/domain.error.js';

/** Parses a request body with a strict schema; failures become 422 with the failing fields. */
export const parseBody = <S extends z.ZodType>(schema: S, body: unknown): z.infer<S> => {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new DomainError(ErrorCode.ValidationFailed, 422, {
      extensions: {
        fields: result.error.issues.map((issue) => ({
          path: issue.path.join('.') || '(body)',
          code: issue.code,
        })),
      },
    });
  }
  return result.data;
};
