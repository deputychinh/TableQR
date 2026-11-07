import { randomUUID } from 'node:crypto';
import type { Request } from 'express';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;
const REQUEST_ID = Symbol('requestId');

type WithRequestId = Request & { [REQUEST_ID]?: string };

/** Accepts a caller's id only when it is short and log-safe; otherwise mints a UUID. */
export const assignRequestId = (request: Request, incoming: string | undefined): string => {
  const id = incoming !== undefined && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  (request as WithRequestId)[REQUEST_ID] = id;
  return id;
};

export const requestIdOf = (request: Request): string | undefined =>
  (request as WithRequestId)[REQUEST_ID];
