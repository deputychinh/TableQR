import { randomBytes } from 'node:crypto';

/** 128 bits of randomness: unguessable, and short enough for a sparse, easy-to-scan QR code. */
export const QR_TOKEN_BYTES = 16;
/** base64url of 16 bytes, unpadded, is always 22 characters. */
export const QR_TOKEN_LENGTH = 22;
const QR_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/** A fresh table token: 128-bit random, base64url (RFC 4648 §5), no padding (AC8). */
export const newQrToken = (random: (size: number) => Buffer = randomBytes): string =>
  random(QR_TOKEN_BYTES).toString('base64url');

/** Cheap shape check before touching the database; anything else is simply "not found". */
export const isWellFormedQrToken = (value: string): boolean => QR_TOKEN_PATTERN.test(value);

/** The guest page path a table's QR code opens; the web app prefixes its own origin. */
export const guestTablePath = (token: string): string => `/t/${token}`;
