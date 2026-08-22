/**
 * serverFetch.ts — server-side fetch with loopback fallbacks.
 *
 * Tests:
 *   - non-loopback bases are fetched exactly once (no fallback)
 *   - loopback bases try every spelling and return the first that connects
 *   - the fallback only fires on network failures, not on HTTP errors
 *   - if every spelling fails, the last error is thrown
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const originalBase = process.env.NEXT_PUBLIC_API_URL;
function setBase(value: string | undefined) {
  if (value === undefined) delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = value;
  // bust the module cache so the BASES list re-computes
  vi.resetModules();
}

describe('serverFetch', () => {
  let fetchMock: any;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    setBase(originalBase);
    vi.unstubAllGlobals();
  });

  it('fetches a non-loopback URL exactly once', async () => {
    setBase('https://api.example.com/api');
    const { serverFetch } = await import('./serverFetch');
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    await serverFetch('/products');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/api/products');
  });

  it('returns the first successful response on a loopback fallback', async () => {
    setBase('http://localhost:3001/api');
    const { serverFetch } = await import('./serverFetch');
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith('http://127.0.0.1')) {
        return { ok: true, status: 200, url };
      }
      throw new TypeError('NetworkError');
    });
    const res = await serverFetch('/products');
    expect(res.url).toContain('127.0.0.1');
    // The first attempt (localhost) failed, the second (127.0.0.1) succeeded
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on a non-2xx response (4xx/5xx are valid HTTP responses)', async () => {
    setBase('http://localhost:3001/api');
    const { serverFetch } = await import('./serverFetch');
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    const res = await serverFetch('/products');
    expect(res.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('tries every spelling and gives up with the last error', async () => {
    setBase('http://localhost:3001/api');
    const { serverFetch } = await import('./serverFetch');
    fetchMock.mockRejectedValue(new TypeError('Network down'));
    await expect(serverFetch('/x')).rejects.toThrow(/Network down/);
    // localhost, 127.0.0.1, [::1]
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('returns the response from the configured URL without warning when it works first time', async () => {
    setBase('http://localhost:3001/api');
    const { serverFetch } = await import('./serverFetch');
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    await serverFetch('/x');
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('warns when the fallback kicks in', async () => {
    setBase('http://localhost:3001/api');
    const { serverFetch } = await import('./serverFetch');
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith('http://localhost')) throw new TypeError('down');
      return { ok: true, status: 200, url };
    });
    await serverFetch('/x');
    expect(consoleSpy).toHaveBeenCalled();
    expect(consoleSpy.mock.calls[0][0]).toMatch(/unreachable/);
    consoleSpy.mockRestore();
  });
});
