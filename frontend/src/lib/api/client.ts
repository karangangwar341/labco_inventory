import { ApiError } from './errors';
import { generateIdempotencyKey } from './idempotency';
import { getSessionToken } from '../auth/session';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export interface RequestOptions extends RequestInit {
  idempotencyKey?: string;
  skipAuth?: boolean;
}

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

  // 3. Mandatory Idempotency-Key on mutating operations
  const method = (options.method || 'GET').toUpperCase();
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
    if (!headers.has('Idempotency-Key')) {
      headers.set(
        'Idempotency-Key',
        options.idempotencyKey || generateIdempotencyKey(),
      );
    }
  }

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

    return await res.json();
  } catch (err: unknown) {
    if (err instanceof ApiError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : 'Network error or server unreachable';
    throw new ApiError(0, message);
  }
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
