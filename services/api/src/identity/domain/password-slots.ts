import { Semaphore } from '../../common/concurrency/semaphore.js';
import { hashPassword, verifyPassword } from './password.js';

/**
 * Each scrypt call needs ~128 MB; at most this many run at once per process and the rest queue,
 * so a burst of sign-ins cannot exhaust memory. The app uses these wrappers; `password.ts` stays
 * free of relative imports for the platform-admin CLI (Node runs it without a build).
 */
export const MAX_CONCURRENT_SCRYPT = 4;
const slots = new Semaphore(MAX_CONCURRENT_SCRYPT);

export const hashPasswordLimited = (password: string): Promise<string> =>
  slots.run(() => hashPassword(password));

export const verifyPasswordLimited = (password: string, stored: string): Promise<boolean> =>
  slots.run(() => verifyPassword(password, stored));
