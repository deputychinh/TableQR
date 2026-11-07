import { createHash, randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;

/** 256-bit random token for the cookie; only its SHA-256 is stored (ADR 0002). */
export const newSessionToken = (): string => randomBytes(TOKEN_BYTES).toString('base64url');

export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
