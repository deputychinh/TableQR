import { verifyPassword } from './password.js';

/**
 * A well-formed scrypt hash with the same parameters as `hashPassword`, of no known password.
 * Unknown or disabled accounts are checked against it so every sign-in costs one full scrypt:
 * the response time does not reveal which emails exist (TQR-004 D2).
 */
export const DUMMY_PASSWORD_HASH =
  'scrypt$131072$8$1$NJe1NKdbKTXLxXMLR66gMg$8p59T0O1otETu-L2qCadncbpMbpIUSjAPVhSqaOQso0';

export interface Candidate {
  passwordHash: string;
  disabledAt: Date | null;
}

export type VerifyPassword = (password: string, stored: string) => Promise<boolean>;

/** True only for an enabled account with the right password; always runs exactly one verify. */
export const checkCredentials = async (
  candidate: Candidate | undefined,
  password: string,
  verify: VerifyPassword = verifyPassword,
): Promise<boolean> => {
  const usable = candidate !== undefined && candidate.disabledAt === null;
  const matches = await verify(password, usable ? candidate.passwordHash : DUMMY_PASSWORD_HASH);
  return usable && matches;
};
