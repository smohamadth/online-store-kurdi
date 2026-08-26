/**
 * http.ts — the new shared HTTP client (authHttp / http / ApiError).
 *
 * The previous test (api.test.ts) covered the older `api` singleton; this
 * file covers the refactored client that admin/SSR code uses.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApiError, authHttp, http, getToken } from './http';


type FetchMockInit = {
  headers: Record<string, string>;
  body: string;
  method?: string;
};

describe('ApiError', () => {
  it('carries the status, code, and field errors', () => {
    const e = new ApiError('Bad', 400, 'INVALID', [{ field: 'x', message: 'y' }]);
    expect(e.message).toBe('Bad');
    expect(e.status).toBe(400);
    expect(e.code).toBe('INVALID');
    expect(e.fieldErrors).toEqual([{ field: 'x', message: 'y' }]);
    expect(e.isAuthError).toBe(false);
  });

  it('flags auth errors (401/403) via the getter', () => {
    expect(new ApiError('x', 401).isAuthError).toBe(true);
    expect(new ApiError('x', 403).isAuthError).toBe(true);
    expect(new ApiError('x', 500).isAuthError).toBe(false);
  });
});

describe('getToken', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null on the server (no window)', () => {
    // jsdom provides window by default, but the helper checks for it.
    const originalWindow = (global as any).window;
    delete (global as any).window;
    expect(getToken()).toBeNull();
    (global as any).window = originalWindow;
  });

  it('returns the stored token', () => {
    localStorage.setItem('token', 'abc');
    expect(getToken()).toBe('abc');
  });
});

describe('http client', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('parses the JSON envelope and resolves with the data field', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', data: { hello: 'world' } }),
    })) as any);
    const env = await http.get<{ hello: string }>('/test');
    expect(env.data.hello).toBe('world');
  });

  it('throws an ApiError with the server message on a 4xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 422,
      json: async () => ({
        status: 'error',
        message: 'Validation failed',
        errors: [{ field: 'email', message: 'taken' }],
      }),
    })) as any);
    let caught: any;
    try { await http.get('/test'); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(ApiError);
    expect(caught.status).toBe(422);
    // Field errors are joined into the message when no top-level message.
    expect(caught.message).toMatch(/email: taken/);
    expect(caught.fieldErrors).toEqual([{ field: 'email', message: 'taken' }]);
  });

  it('joins field errors into the message when no top-level message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ status: 'error', errors: [{ field: 'a', message: 'bad' }] }),
    })) as any);
    await expect(http.get('/test')).rejects.toThrow(/a: bad/);
  });

  it('falls back to a generic message when the body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => { throw new Error('not json'); },
    })) as any);
    await expect(http.get('/test')).rejects.toThrow(/503/);
  });

  it('reports a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('NetworkError'); }) as any);
    await expect(http.get('/test')).rejects.toThrow(/Could not reach the server/);
  });

  it('attaches the bearer token when useAuthHttp is true', async () => {
    localStorage.setItem('token', 'tok123');
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', data: null }),
    }));
    vi.stubGlobal('fetch', fetchMock as any);
    await authHttp.get('/admin/ping');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, FetchMockInit];
    expect(init.headers.Authorization).toBe('Bearer tok123');
  });

  it('serialises a body to JSON', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', data: null }),
    }));
    vi.stubGlobal('fetch', fetchMock as any);
    await authHttp.post('/x', { a: 1 });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, FetchMockInit];
    expect(init.body).toBe('{"a":1}');
  });

  it('encodes null responses (204-style) as undefined', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 204,
      json: async () => { throw new Error('no body'); },
    })) as any);
    const env = await http.post<undefined>('/x');
    expect(env).toBeUndefined();
  });

  it('sends raw body as-is (no JSON encoding) when rawBody: true', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', data: null }),
    }));
    vi.stubGlobal('fetch', fetchMock as any);
    await authHttp.post('/x', 'a,b,c\n1,2,3', {
      headers: { 'Content-Type': 'text/csv' },
      rawBody: true,
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, FetchMockInit];
    expect(init.body).toBe('a,b,c\n1,2,3');
    expect(init.headers['Content-Type']).toBe('text/csv');
  });
});
