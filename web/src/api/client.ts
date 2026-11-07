/** Same-origin API base (ADR 0002); Vite proxies it in dev and preview, a reverse proxy in production. */
export const API_BASE = '/api';

export interface FieldError {
  path: string;
  code: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly fields: FieldError[] = [],
    options?: ErrorOptions,
  ) {
    super(`API ${status} ${code}`, options);
  }
}

const toApiError = async (response: Response): Promise<ApiError> => {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === 'object' &&
      body !== null &&
      'code' in body &&
      typeof body.code === 'string'
    ) {
      const fields =
        'fields' in body && Array.isArray(body.fields) ? (body.fields as FieldError[]) : [];
      return new ApiError(response.status, body.code, fields);
    }
  } catch {
    // A non-JSON error body (e.g. a proxy page) still maps to a generic code below.
  }
  return new ApiError(response.status, 'HTTP_ERROR');
};

const request = async <T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body: unknown,
  fetchImpl: typeof fetch,
): Promise<T> => {
  let response: Response;
  try {
    response = await fetchImpl(`${API_BASE}${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error: unknown) {
    throw new ApiError(0, 'NETWORK', [], { cause: error });
  }
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
};

/** GET a JSON resource; throws ApiError with the problem `code` on a non-2xx answer or a network failure. */
export const getJson = <T>(path: string, fetchImpl: typeof fetch = fetch): Promise<T> =>
  request<T>('GET', path, undefined, fetchImpl);

export const sendJson = <T>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<T> => request<T>(method, path, body, fetchImpl);
