import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { activateStoreTheme } from './activateStoreTheme';
import { CLIENT_API_BASE } from './apiBase';

describe('activateStoreTheme', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ status: 'success', data: { activeTheme: 'minimal' } }),
      })),
    );
    localStorage.setItem('token', 'admin-token');
  });

  afterEach(() => {
    localStorage.removeItem('token');
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals?.();
  });

  it('PUTs activeTheme to CLIENT_API_BASE with the admin token', async () => {
    const result = await activateStoreTheme('minimal');
    expect(result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(`${CLIENT_API_BASE}/theme`);
    expect(url).not.toContain('localhost:3001');
    expect(init.method).toBe('PUT');
    expect(init.headers.Authorization).toBe('Bearer admin-token');
    expect(JSON.parse(init.body)).toEqual({ activeTheme: 'minimal' });
  });

  it('refuses to call the API without an admin token', async () => {
    localStorage.removeItem('token');
    const result = await activateStoreTheme('minimal');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/Sign in as admin/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('surfaces the API error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ status: 'error', message: 'Unknown theme "nope".' }),
      })),
    );
    const result = await activateStoreTheme('nope');
    expect(result).toEqual({ ok: false, message: 'Unknown theme "nope".' });
  });
});
