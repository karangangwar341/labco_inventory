import { ApiError } from './errors';
import { generateIdempotencyKey } from './idempotency';
import { getSessionToken } from '../auth/session';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'development' ? 'http://localhost:4000/api/v1' : '');

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL must be configured when building the production frontend.');
}

export interface RequestOptions extends RequestInit {
  idempotencyKey?: string;
  skipAuth?: boolean;
}

// In-flight GET request deduplication to prevent duplicate concurrent queries to backend
const inFlightRequests = new Map<string, Promise<unknown>>();

export async function request<T = unknown>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const url = endpoint.startsWith('http')
    ? endpoint
    : `${API_BASE_URL.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;

  const headers = new Headers(options.headers || {});

  // 1. Content-Type default
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // 2. Token injection
  if (!options.skipAuth) {
    const token = getSessionToken();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const method = (options.method || 'GET').toUpperCase();

  // Deduplicate identical in-flight GET requests (e.g. from React double mounts or concurrent components)
  const cacheKey = method === 'GET' ? `${url}|${headers.get('Authorization') || ''}` : null;
  if (cacheKey && inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey) as Promise<T>;
  }

  // 3. Mandatory Idempotency-Key on mutating operations
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
    if (!headers.has('Idempotency-Key')) {
      headers.set(
        'Idempotency-Key',
        options.idempotencyKey || generateIdempotencyKey(),
      );
    }
  }

  // 4. Request Correlation ID
  if (!headers.has('X-Request-ID')) {
    headers.set(
      'X-Request-ID',
      `fe_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    );
  }

  const execute = async (): Promise<T> => {
    try {
      const res = await fetch(url, {
        ...options,
        headers,
        credentials: 'include', // Support httpOnly cookie session delivery
      });

      // Handle 401 Session Replacement or Revocation
      if (res.status === 401 && typeof window !== 'undefined') {
        const errBody = await res.clone().json().catch(() => ({}));
        const isReplaced =
          errBody.message?.includes('replaced') ||
          errBody.error === 'SESSION_REPLACED';

        window.dispatchEvent(
          new CustomEvent('session_unauthorized', {
            detail: { isReplaced, message: errBody.message },
          }),
        );
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const message =
          errorData.message ||
          `Request failed with status ${res.status}: ${res.statusText}`;
        throw new ApiError(res.status, message, errorData);
      }

      if (res.status === 204) {
        return {} as T;
      }

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('text/')) {
        return (await res.text()) as T;
      }
      return await res.json();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : 'Network error or server unreachable';
      throw new ApiError(0, message);
    }
  };

  const promise = execute();
  if (cacheKey) {
    inFlightRequests.set(cacheKey, promise);
    promise
      .catch(() => {})
      .finally(() => {
        inFlightRequests.delete(cacheKey);
      });
  }

  return promise;
}

export const apiClient = {
  get: <T = unknown>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'GET' }),

  post: <T = unknown>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),

  patch: <T = unknown>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),

  put: <T = unknown>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),

  delete: <T = unknown>(endpoint: string, options?: RequestOptions) =>
    request<T>(endpoint, { ...options, method: 'DELETE' }),
};
