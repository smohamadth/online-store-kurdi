'use client';

/**
 * Single HTTP client for every browser -> API call.
 *
 * Before this existed the same three lines were repeated across 45 files:
 *   - `process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'`  (78x)
 *   - `Authorization: \`Bearer ${token}\``                              (74x)
 *   - an ad-hoc `if (!res.ok)` branch, or none at all
 *
 * That duplication is why error handling drifted: some callers surfaced the
 * server's message, some showed "API error: 400", and several silently
 * swallowed failures and wrote to localStorage instead. Centralising it means
 * a fix applies everywhere at once.
 */

// Defined in a non-'use client' module so SERVER components can import it too.
// Importing it from here (a client module) hands a server component a
// client-reference Symbol, not a string - see lib/apiBase.ts for the bug that
// caused. Re-exported so the ~37 existing client imports are unaffected.
import { API_BASE } from './apiBase';
export { API_BASE };

/** Error carrying the server's real message plus status and field details. */
export class ApiError extends Error {
  status: number;
  code?: string;
  fieldErrors?: { field: string; message: string }[];

  constructor(
    message: string,
    status: number,
    code?: string,
    fieldErrors?: { field: string; message: string }[]
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }

  /** True when the user needs to sign in again. */
  get isAuthError() {
    return this.status === 401 || this.status === 403;
  }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  /** Attach the stored bearer token. */
  auth?: boolean;
  /** Serialised as JSON automatically. */
  body?: unknown;
  /** Bypass Next's fetch cache (default true — store data changes often). */
  fresh?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = false, body, fresh = true, headers, ...rest } = options;

  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>),
  };

  if (auth) {
    const token = getToken();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...rest,
      headers: finalHeaders,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(fresh ? { cache: 'no-store' as RequestCache } : {}),
    });
  } catch {
    // Network-level failure: no response at all.
    throw new ApiError('Could not reach the server. Please check your connection.', 0);
  }

  if (res.status === 204) return undefined as T;

  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    /* empty or non-JSON body */
  }

  if (!res.ok) {
    // The API returns { message } or { errors: [{ field, message }] }.
    const fieldErrors = Array.isArray(payload?.errors) ? payload.errors : undefined;
    const message =
      (fieldErrors?.length
        ? fieldErrors.map((e: any) => (e.field ? `${e.field}: ${e.message}` : e.message)).join(', ')
        : payload?.message) || `Request failed (${res.status})`;

    throw new ApiError(message, res.status, payload?.code, fieldErrors);
  }

  return payload as T;
}

/** Shape every endpoint in this API returns. */
export interface Envelope<T> {
  status: string;
  data: T;
  message?: string;
  pagination?: { page: number; limit: number; total: number; totalPages: number };
}

export const http = {
  get: <T>(path: string, opts?: RequestOptions) =>
    request<Envelope<T>>(path, { ...opts, method: 'GET' }),

  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<Envelope<T>>(path, { ...opts, method: 'POST', body }),

  put: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<Envelope<T>>(path, { ...opts, method: 'PUT', body }),

  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<Envelope<T>>(path, { ...opts, method: 'PATCH', body }),

  delete: <T>(path: string, opts?: RequestOptions) =>
    request<Envelope<T>>(path, { ...opts, method: 'DELETE' }),
};

/** Authenticated variants — the common case in the admin panel. */
export const authHttp = {
  get: <T>(path: string, opts?: RequestOptions) => http.get<T>(path, { ...opts, auth: true }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    http.post<T>(path, body, { ...opts, auth: true }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    http.put<T>(path, body, { ...opts, auth: true }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    http.patch<T>(path, body, { ...opts, auth: true }),
  delete: <T>(path: string, opts?: RequestOptions) =>
    http.delete<T>(path, { ...opts, auth: true }),
};

/** Normalise any thrown value into a message safe to show a user. */
export function errorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
