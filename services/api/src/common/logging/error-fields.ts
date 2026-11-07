/**
 * Client- and log-safe description of an unexpected error. Messages are never logged: driver errors
 * embed SQL parameters (Drizzle: "Failed query: … params: …"), which can hold tokens or phone numbers.
 */
export interface ErrorFields {
  error: string;
  dbCode?: string;
  constraint?: string;
  causeError?: string;
}

const stringProp = (value: unknown, key: string): string | undefined => {
  if (typeof value === 'object' && value !== null && key in value) {
    const prop: unknown = (value as Record<string, unknown>)[key];
    return typeof prop === 'string' ? prop : undefined;
  }
  return undefined;
};

export const errorFields = (error: unknown): ErrorFields => {
  const cause: unknown = error instanceof Error ? error.cause : undefined;
  const fields: ErrorFields = { error: error instanceof Error ? error.name : typeof error };
  const dbCode = stringProp(error, 'code') ?? stringProp(cause, 'code');
  const constraint = stringProp(error, 'constraint') ?? stringProp(cause, 'constraint');
  if (dbCode !== undefined) fields.dbCode = dbCode;
  if (constraint !== undefined) fields.constraint = constraint;
  if (cause instanceof Error) fields.causeError = cause.name;
  return fields;
};
