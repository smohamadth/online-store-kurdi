/**
 * Rate-limit policy tests.
 *
 * Pins the two decisions the September 2026 audit found broken:
 *
 *   1. classify() — reads, writes and auth attempts must land in SEPARATE
 *      budgets. One shared bucket meant ~8 calls per storefront page view
 *      burned a 100-per-window budget in a dozen pages.
 *
 *   2. trustProxyHops() — a COUNT, never `true`. Too low and every visitor
 *      behind a proxy shares one bucket (store-wide 429s, and the per-IP
 *      login lockout locks out everyone). `true` and a client can forge
 *      X-Forwarded-For to get unlimited buckets.
 */
import { describe, it, expect } from 'vitest';
import { classify, isReadRequest, isAuthPath, trustProxyHops } from '../../../src/config/rateLimits';

describe('isReadRequest', () => {
  it('treats GET/HEAD/OPTIONS as reads', () => {
    expect(isReadRequest('GET')).toBe(true);
    expect(isReadRequest('head')).toBe(true);
    expect(isReadRequest('OPTIONS')).toBe(true);
  });

  it('treats state-changing verbs as writes', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(isReadRequest(m)).toBe(false);
    }
  });
});

describe('isAuthPath', () => {
  it('matches the brute-force surfaces', () => {
    expect(isAuthPath('/api/auth/login')).toBe(true);
    expect(isAuthPath('/api/auth/register')).toBe(true);
    expect(isAuthPath('/api/auth/forgot-password')).toBe(true);
    expect(isAuthPath('/api/auth/reset-password')).toBe(true);
  });

  it('ignores query strings and trailing slashes', () => {
    expect(isAuthPath('/api/auth/login?next=/account')).toBe(true);
    expect(isAuthPath('/api/auth/login/')).toBe(true);
  });

  it('leaves ordinary session calls alone', () => {
    // /me and /refresh are made constantly by an active shopper. On the
    // 20-per-window auth budget they would log people out mid-browse.
    expect(isAuthPath('/api/auth/me')).toBe(false);
    expect(isAuthPath('/api/auth/refresh')).toBe(false);
    expect(isAuthPath('/api/products')).toBe(false);
  });
});

describe('classify', () => {
  it('puts page-load traffic on the read budget', () => {
    expect(classify('GET', '/api/products')).toBe('read');
    expect(classify('GET', '/api/settings')).toBe('read');
  });

  it('puts checkout and cart writes on the write budget', () => {
    expect(classify('POST', '/api/orders')).toBe('write');
    expect(classify('DELETE', '/api/cart/items/1')).toBe('write');
  });

  it('puts login attempts on the tight auth budget', () => {
    expect(classify('POST', '/api/auth/login')).toBe('auth');
    expect(classify('POST', '/api/auth/forgot-password')).toBe('auth');
  });

  it('does not charge a CORS preflight against the auth budget', () => {
    // Preflights carry no credentials and cannot be a brute-force attempt.
    expect(classify('OPTIONS', '/api/auth/login')).toBe('read');
  });
});

describe('trustProxyHops', () => {
  it('defaults to 0 when unset or blank', () => {
    expect(trustProxyHops(undefined)).toBe(0);
    expect(trustProxyHops('')).toBe(0);
    expect(trustProxyHops('   ')).toBe(0);
  });

  it('reads a hop count', () => {
    expect(trustProxyHops('1')).toBe(1);
    expect(trustProxyHops('2')).toBe(2);
  });

  it('refuses anything that is not a non-negative integer', () => {
    // Notably 'true': Express accepts it and would then trust a forged
    // X-Forwarded-For, handing an attacker a fresh rate-limit bucket per
    // request and poisoning every recorded consent/audit IP.
    expect(trustProxyHops('true')).toBe(0);
    expect(trustProxyHops('-1')).toBe(0);
    expect(trustProxyHops('1.5')).toBe(0);
    expect(trustProxyHops('all')).toBe(0);
  });
});
