'use client';

/**
 * Storefront analytics events (client side).
 *
 * Sends the events the in-store analytics + recommendation engine
 * consumes:
 *   - view         product page views (trending, conversion,
 *                  "based on your browsing history")
 *   - add_to_cart  cart additions (view-to-cart conversion)
 *   - wishlist     wishlist adds
 * Search and purchase events are recorded server-side (search
 * endpoint, order creation) - do NOT send them from here or the
 * counts double.
 *
 * Privacy: this is only collected when the store has enabled
 * ANALYTICS_TRACKING_ENABLED on the API; with the flag off the
 * endpoint 404s and the request below is a no-op that gets
 * swallowed. The /privacy page documents both states. The
 * x-session-id header is a random per-browser-session identifier
 * (sessionStorage - cleared when the session ends), never a cookie.
 *
 * Hard rules for this module:
 *   - fire and forget: never await, never throw, never block UI
 *   - keepalive so events survive the next navigation
 *   - the bearer token is attached only when the visitor is signed
 *     in, which is what links events to an account (server-side)
 */
// Browser-safe base: same-origin /api when NEXT_PUBLIC_API_URL points at
// loopback (a user's browser can never reach that host - see lib/http.ts).
import { CLIENT_API_BASE as API_BASE } from './apiBase';

const SESSION_KEY = 'store_session_id';

/** A per-browser-session anonymous id (persists across refreshes, dies with the session). */
export function getSessionId(): string {
  if (typeof window === 'undefined' || !window.sessionStorage) return 'unknown';
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    // Storage blocked (private mode etc.) - a throwaway id keeps the
    // request valid without persisting anything.
    return `s-ephemeral-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export interface TrackEventInput {
  eventType: 'view' | 'add_to_cart' | 'wishlist';
  productId?: string;
  categoryId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Fire one analytics event. Returns immediately; the request goes out
 * in the background. All failures (offline, 404 when tracking is
 * disabled, blocked storage) are swallowed by design.
 */
export function trackEvent(event: TrackEventInput): void {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-session-id': getSessionId(),
    };
    try {
      const token = window.localStorage.getItem('token');
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch {
      // storage blocked - send without account linkage
    }
    void fetch(`${API_BASE}/analytics/track`, {
      method: 'POST',
      headers,
      body: JSON.stringify(event),
      keepalive: true,
    }).catch(() => {
      /* analytics must never surface an error in the storefront */
    });
  } catch {
    /* same */
  }
}
