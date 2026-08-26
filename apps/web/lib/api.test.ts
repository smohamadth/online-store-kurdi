/**
 * api.ts — `apiClient` (the small wrapper used in the storefront) plus the
 * image-URL helpers.
 *
 * Tests:
 *   - getImageUrl: relative path gets the API base prepended
 *   - getProductImage: prefers the requested variant, falls back through
 *     the chain (medium, thumbnail, url)
 *   - getCategoryEmoji: known categories return the right emoji, unknown
 *     returns the default
 *   - the apiClient surfaces server messages instead of bare status codes
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api, getImageUrl, getProductImage, getCategoryEmoji } from './api';


type FetchMockInit = {
  headers: Record<string, string>;
  body: string;
  method?: string;
};

describe('getImageUrl', () => {
  it('returns the URL unchanged for absolute http(s) URLs', () => {
    expect(getImageUrl('https://cdn.example.com/x.png')).toBe('https://cdn.example.com/x.png');
  });

  it('passes through data: URIs', () => {
    const d = 'data:image/png;base64,AAAA';
    expect(getImageUrl(d)).toBe(d);
  });

  it('prepends the API base for a relative URL', () => {
    expect(getImageUrl('/uploads/hat.jpg')).toBe('http://test.api/uploads/hat.jpg');
  });

  it('returns an empty string for null/undefined/empty', () => {
    expect(getImageUrl(null)).toBe('');
    expect(getImageUrl(undefined)).toBe('');
    expect(getImageUrl('')).toBe('');
  });
});

describe('getProductImage', () => {
  it('returns "" for falsy input', () => {
    expect(getProductImage(null)).toBe('');
    expect(getProductImage(undefined)).toBe('');
    expect(getProductImage(0 as any)).toBe('');
  });

  it('returns the url when no context is provided', () => {
    expect(getProductImage({ url: 'http://x/y.png' })).toBe('http://x/y.png');
  });

  it('falls back through the chain (thumbnail -> url)', () => {
    expect(getProductImage({ url: 'http://x/u.png', thumbnail: 'http://x/t.png' }, 'thumbnail'))
      .toBe('http://x/t.png');
  });

  it('uses the context-appropriate variant first', () => {
    expect(getProductImage({ url: 'http://x/u.png', medium: 'http://x/m.png' }, 'card'))
      .toBe('http://x/m.png');
  });

  it('falls back to url when the chosen variant is missing', () => {
    expect(getProductImage({ url: 'http://x/u.png' }, 'zoom')).toBe('http://x/u.png');
  });

  it('returns "" when there is no usable image field', () => {
    expect(getProductImage({})).toBe('');
  });
});

describe('getCategoryEmoji', () => {
  it('maps known categories to the right emoji', () => {
    expect(getCategoryEmoji('Electronics')).toBe('📱');
    expect(getCategoryEmoji('clothing')).toBe('👕');
    expect(getCategoryEmoji('Books')).toBe('📚');
    expect(getCategoryEmoji('Digital Products')).toBe('💻');
  });

  it('returns the default for unknown categories', () => {
    expect(getCategoryEmoji('weapons')).toBe('📦');
    expect(getCategoryEmoji('')).toBe('📦');
    expect(getCategoryEmoji(undefined as any)).toBe('📦');
  });
});

describe('api client', () => {
  beforeEach(() => {
    // Reset the fetch mock between tests
    vi.restoreAllMocks();
  });

  it('returns a server message and parses the JSON envelope on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', data: { foo: 'bar' } }),
    })) as any);
    const res = await api.getProducts();
    expect(res.status).toBe('success');
    expect((res.data as any).foo).toBe('bar');
  });

  it('throws an Error with the server message on a non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ status: 'error', message: 'Bad email' }),
    })) as any);
    await expect(api.getProducts()).rejects.toThrow('Bad email');
  });

  it('falls back to a generic message when the error body has none', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    })) as any);
    await expect(api.getProducts()).rejects.toThrow(/500/);
  });

  it('adds the bearer token when one is supplied', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', data: null }),
    }));
    vi.stubGlobal('fetch', fetchMock as any);
    await api.getCurrentUser('abc.def.ghi');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, FetchMockInit];
    expect(init.headers.Authorization).toBe('Bearer abc.def.ghi');
  });

  it('omits the Authorization header when no token is supplied', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', data: null }),
    }));
    vi.stubGlobal('fetch', fetchMock as any);
    await api.getProducts();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, FetchMockInit];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('serialises a body to JSON when one is supplied', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success' }),
    }));
    vi.stubGlobal('fetch', fetchMock as any);
    await api.login('a@b.c', 'Password123!');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, FetchMockInit];
    expect(init.body).toBe(JSON.stringify({ email: 'a@b.c', password: 'Password123!' }));
  });

  it('reports a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as any);
    // The legacy api singleton just rethrows - the friendlier wrapper is in
    // http.test.ts. The point of this test is to confirm the error surfaces.
    await expect(api.getProducts()).rejects.toThrow();
  });
});
