/** Same-origin API base (ADR 0002); Vite proxies it in dev and preview, a reverse proxy in production. */
export const API_BASE = '/api';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    options?: ErrorOptions,
  ) {
    super(`API ${status} ${code}`, options);
  }
}

const problemCode = async (response: Response): Promise<string> => {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === 'object' &&
      body !== null &&
      'code' in body &&
      typeof body.code === 'string'
    ) {
      return body.code;
    }
  } catch {
    // A non-JSON error body (e.g. a proxy page) still maps to a generic code below.
  }
  return 'HTTP_ERROR';
};

/** GET a JSON resource; throws ApiError with the problem `code` on a non-2xx answer or a network failure. */
export const getJson = async <T>(path: string, fetchImpl: typeof fetch = fetch): Promise<T> => {
  let response: Response;
  try {
    response = await fetchImpl(`${API_BASE}${path}`, { credentials: 'same-origin' });
  } catch (error: unknown) {
    throw new ApiError(0, 'NETWORK', { cause: error });
  }
  if (!response.ok) {
    throw new ApiError(response.status, await problemCode(response));
  }
  return (await response.json()) as T;
};
