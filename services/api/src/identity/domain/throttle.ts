export const MAX_FAILED_LOGINS = 10;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/** AC4: blocked when the window already holds the maximum number of failures. */
export const isLoginBlocked = (failuresInWindow: number): boolean =>
  failuresInWindow >= MAX_FAILED_LOGINS;

export const windowStart = (now: Date): Date => new Date(now.getTime() - LOGIN_WINDOW_MS);
