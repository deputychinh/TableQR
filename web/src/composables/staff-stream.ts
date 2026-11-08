import { ApiError, getJson, reportUnauthorized } from '@/api/client';
import type { StreamOptions } from './useStream';

/** True unless `/api/me` answers 401 (a network error is not proof of a signed-out person). */
export const staffSessionAlive = async (): Promise<boolean> => {
  try {
    await getJson('/me');
    return true;
  } catch (error: unknown) {
    return !(error instanceof ApiError && error.status === 401);
  }
};

/**
 * `useStream` options for staff screens (TQR-031): a revoked stream, or one the browser gave up on
 * while the session is gone, sends the person to sign-in (AC16) instead of reconnecting forever
 * under "Mất kết nối".
 */
export const staffStream: StreamOptions = {
  onRevoked: reportUnauthorized,
  checkSession: staffSessionAlive,
};
