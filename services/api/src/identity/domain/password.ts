import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { Semaphore } from '../../common/concurrency/semaphore.js';

// OWASP Password Storage Cheat Sheet minimums for scrypt.
const N = 2 ** 17;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const MAX_MEMORY = 256 * 1024 * 1024;
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;
/** Each scrypt call needs ~128 MB; at most this many run at once per process, the rest queue. */
export const MAX_CONCURRENT_SCRYPT = 4;
const scryptSlots = new Semaphore(MAX_CONCURRENT_SCRYPT);

const derive = (password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> =>
  scryptSlots.run(
    () =>
      new Promise<Buffer>((resolve, reject) => {
        scrypt(password, salt, KEY_LENGTH, { N: n, r, p, maxmem: MAX_MEMORY }, (error, key) => {
          if (error) reject(error);
          else resolve(key);
        });
      }),
  );

/** `scrypt$N$r$p$salt$hash` (base64url), so parameters can be raised later without breaking old hashes. */
export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, N, R, P);
  return ['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$');
};

export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = await derive(
    password,
    Buffer.from(salt, 'base64url'),
    Number(n),
    Number(r),
    Number(p),
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
