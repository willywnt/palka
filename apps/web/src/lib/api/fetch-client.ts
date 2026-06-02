import type { ApiError, ApiResponse } from '@olshop/types';

import { AppError, DomainError } from '@/lib/errors';

export type ApiResult<T> =
  | { success: true; data: T; meta?: ApiResponse<T>['meta'] }
  | { success: false; error: ApiError };

export interface FetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
}

function buildUrl(path: string, params?: FetchOptions['params']): string {
  const url = path.startsWith('http') ? path : `${window.location.origin}${path}`;

  if (!params) return url;

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return query ? `${url}?${query}` : url;
}

async function parseResponse<T>(response: Response): Promise<ApiResult<T>> {
  const contentType = response.headers.get('content-type');
  const isJson = contentType?.includes('application/json');
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    const error: ApiError = payload?.error ?? {
      code: 'HTTP_ERROR',
      message: response.statusText || 'Request failed',
    };

    return { success: false, error };
  }

  return {
    success: true,
    data: (payload?.data ?? payload) as T,
    meta: payload?.meta,
  };
}

export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<ApiResult<T>> {
  const { body, params, headers, ...rest } = options;

  try {
    const response = await fetch(buildUrl(path, params), {
      ...rest,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    return parseResponse<T>(response);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('API fetch failed', { path, error: String(error) });
    }
    throw AppError.fromUnknown(error);
  }
}

export async function apiFetchOrThrow<T>(path: string, options?: FetchOptions): Promise<T> {
  const result = await apiFetch<T>(path, options);

  if (!result.success) {
    // Preserve the server's real error code (and any field details) rather than
    // collapsing everything to 'UNKNOWN'. DomainError carries an arbitrary code.
    throw new DomainError(result.error.code, result.error.message, 400, result.error.details);
  }

  return result.data;
}
