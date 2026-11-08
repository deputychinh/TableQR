export const UNIQUE_VIOLATION = '23505';
export const FOREIGN_KEY_VIOLATION = '23503';

const findOnChain = (error: unknown, key: 'code' | 'constraint'): string | undefined => {
  let current: unknown = error;
  while (current instanceof Error) {
    const value: unknown = (current as Error & Partial<Record<string, unknown>>)[key];
    if (typeof value === 'string') return value;
    current = current.cause;
  }
  return undefined;
};

/** The Postgres SQLSTATE of an error (drizzle wraps the driver error in `cause`). */
export const pgCode = (error: unknown): string | undefined => findOnChain(error, 'code');

/** The constraint name of a Postgres error, when it has one. */
export const pgConstraint = (error: unknown): string | undefined =>
  findOnChain(error, 'constraint');

/** True when the error is a unique violation of the named index or constraint. */
export const isUniqueViolation = (error: unknown, constraint: string): boolean =>
  pgCode(error) === UNIQUE_VIOLATION && pgConstraint(error) === constraint;
