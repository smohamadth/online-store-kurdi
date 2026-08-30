/**
 * lib/tracking.ts - storefront analytics events.
 *
 * The hard contract this module must keep (see its header comment):
 *   - a stable per-session id sent as x-session-id
 *   - the bearer token attached only when the visitor is signed in
 *   - fire-and-forget: a 404 (tracking disabled) or a network failure
 *     must never surface in the storefront
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { trackEvent, getSessionId } from './tracking';
import { CLIENT_API_BASE } from './apiBase';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getSessionId', () => {
  it('is stable within a browser session', () => {
    const a = getSessionId();
    const b = getSessionId();
    expect(a).toBe(b);
    expect(a).toMatch(/^s-/);
  });

  it('changes when the session storage is cleared', () => {
    const a = getSessionId();
    sessionStorage.clear();
    const b = getSessionId();
    expect(b).not.toBe(a);
  });
});

describe('trackEvent', () => {
  it('posts the event with the session id header', async () => {
    trackEvent({ eventType: 'view', productId: 'p-1', metadata: { slug: 'x' } });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${CLIENT_API_BASE}/analytics/track`);
    expect(init.method).toBe('POST');
    expect(init.headers['x-session-id']).toBe(getSessionId());
    expect(JSON.parse(init.body)).toEqual({
      eventType: 'view',
      productId: 'p-1',
      metadata: { slug: 'x' },
    });
    // no token stored -> no Authorization header
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('attaches the bearer token when the visitor is signed in', async () => {
    localStorage.setItem('token', 'the-token');
    trackEvent({ eventType: 'add_to_cart', productId: 'p-2', metadata: { quantity: 1 } });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer the-token');
  });

  it('uses keepalive so the event survives the next navigation', async () => {
    trackEvent({ eventType: 'wishlist', productId: 'p-3' });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls[0][1].keepalive).toBe(true);
  });

  it('swallows a 404 (tracking disabled on the API) without throwing', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    expect(() => trackEvent({ eventType: 'view', productId: 'p-1' })).not.toThrow();
    // let the promise settle so any rejection would surface as unhandled
    await new Promise((r) => setTimeout(r, 0));
  });

  it('swallows network failures', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(() => trackEvent({ eventType: 'view', productId: 'p-1' })).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });
});
