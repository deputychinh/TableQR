const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3310';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    options?: ErrorOptions,
  ) {
    super(`API ${status} ${code}`, options);
  }
}

/** GET a JSON resource from the API; throws ApiError on a non-2xx answer or a network failure. */
export const getJson = async <T>(path: string, fetchImpl: typeof fetch = fetch): Promise<T> => {
  let response: Response;
  try {
    response = await fetchImpl(`${API_URL}${path}`, { credentials: 'include' });
  } catch (error: unknown) {
    throw new ApiError(0, 'NETWORK', { cause: error });
  }
  if (!response.ok) {
    throw new ApiError(response.status, 'HTTP_ERROR');
  }
  return (await response.json()) as T;
};
