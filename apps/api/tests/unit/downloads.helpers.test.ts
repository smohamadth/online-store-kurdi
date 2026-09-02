/**
 * Unit tests for downloads.helpers.
 *
 * Every security-sensitive decision in the download module lives
 * in these helpers. The tests pin the four valid-token predicates
 * (exists / not expired / under limit / product-level limit not
 * hit) and the helper functions around them.
 */
import { describe, it, expect } from 'vitest';
import {
  generateDownloadToken,
  isExpired,
  limitReached,
  tokenStatus,
  remainingDownloads,
  computeExpiry,
} from '../../src/modules/downloads/downloads.helpers';

describe('generateDownloadToken', () => {
  it('returns a non-empty URL-safe string', () => {
    const t = generateDownloadToken();
    expect(t.length).toBeGreaterThanOrEqual(40);
    // base64url: only [A-Za-z0-9_-]
    expect(/^[A-Za-z0-9_-]+$/.test(t)).toBe(true);
  });

  it('returns a different value on each call', () => {
    const a = generateDownloadToken();
    const b = generateDownloadToken();
    expect(a).not.toBe(b);
  });
});

describe('isExpired', () => {
  it('returns false for null / undefined (never expires)', () => {
    expect(isExpired(null)).toBe(false);
    expect(isExpired(undefined)).toBe(false);
  });

  it('returns false for a future date', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(isExpired(future)).toBe(false);
  });

  it('returns true for a past date', () => {
    const past = new Date(Date.now() - 1000);
    expect(isExpired(past)).toBe(true);
  });

  it('treats "exactly now" as expired (the token TTL has elapsed)', () => {
    const now = new Date();
    expect(isExpired(now, now)).toBe(true);
  });

  it('accepts a string-typed date', () => {
    const iso = new Date(Date.now() - 1000).toISOString();
    expect(isExpired(iso)).toBe(true);
  });
});

describe('limitReached', () => {
  it('returns false when limit is null / undefined (unlimited)', () => {
    expect(limitReached(0, null)).toBe(false);
    expect(limitReached(0, undefined)).toBe(false);
  });

  it('returns false when limit is 0 (unlimited semantics)', () => {
    expect(limitReached(0, 0)).toBe(false);
  });

  it('returns true when count >= limit', () => {
    expect(limitReached(3, 3)).toBe(true);
    expect(limitReached(5, 3)).toBe(true);
  });

  it('returns false when count < limit', () => {
    expect(limitReached(2, 3)).toBe(false);
  });

  it('treats null count as 0', () => {
    expect(limitReached(null, 1)).toBe(false);
    expect(limitReached(null, 0)).toBe(false);
  });
});

describe('tokenStatus', () => {
  it('returns ok=true when no limits are set', () => {
    const s = tokenStatus({
      downloadCount: 0,
      downloadLimit: null,
      expiresAt: null,
      productDownloadCount: 0,
      productDownloadLimit: null,
    });
    expect(s.ok).toBe(true);
  });

  it('returns expired when expiresAt is in the past', () => {
    const s = tokenStatus({
      downloadCount: 0,
      downloadLimit: null,
      expiresAt: new Date(Date.now() - 1000),
      productDownloadCount: 0,
      productDownloadLimit: null,
    });
    expect(s.ok).toBe(false);
    expect(s.reason).toBe('expired');
  });

  it('returns limit_exceeded when per-token limit is hit', () => {
    const s = tokenStatus({
      downloadCount: 3,
      downloadLimit: 3,
      expiresAt: null,
      productDownloadCount: 0,
      productDownloadLimit: null,
    });
    expect(s.ok).toBe(false);
    expect(s.reason).toBe('limit_exceeded');
  });

  it('returns product_limit_exceeded when the product-level limit is hit', () => {
    const s = tokenStatus({
      downloadCount: 1,
      downloadLimit: 5,
      expiresAt: null,
      productDownloadCount: 3,
      productDownloadLimit: 3,
    });
    expect(s.ok).toBe(false);
    expect(s.reason).toBe('product_limit_exceeded');
  });

  it('checks expiry before limit', () => {
    // Both expired and over-limit; the route should report
    // 'expired' first so the customer knows the link is dead
    // (vs "wait a few hours" if it were just the limit).
    const s = tokenStatus({
      downloadCount: 100,
      downloadLimit: 5,
      expiresAt: new Date(Date.now() - 1000),
      productDownloadCount: 0,
      productDownloadLimit: null,
    });
    expect(s.reason).toBe('expired');
  });
});

describe('remainingDownloads', () => {
  it('returns Infinity for unlimited', () => {
    expect(remainingDownloads(0, null)).toBe(Infinity);
    expect(remainingDownloads(5, undefined)).toBe(Infinity);
  });

  it('returns the difference (limit - count)', () => {
    expect(remainingDownloads(2, 5)).toBe(3);
  });

  it('returns 0 when at the limit', () => {
    expect(remainingDownloads(3, 3)).toBe(0);
  });

  it('clamps to 0 if count is over the limit', () => {
    expect(remainingDownloads(5, 3)).toBe(0);
  });

  it('returns 0 when the limit is 0 (blocked, not unlimited)', () => {
    expect(remainingDownloads(0, 0)).toBe(0);
  });
});

describe('computeExpiry', () => {
  it('returns null for null / undefined / 0', () => {
    const base = new Date('2026-01-01T00:00:00Z');
    expect(computeExpiry(null, base)).toBeNull();
    expect(computeExpiry(undefined, base)).toBeNull();
    expect(computeExpiry(0, base)).toBeNull();
  });

  it('returns null for non-finite or negative', () => {
    const base = new Date('2026-01-01T00:00:00Z');
    expect(computeExpiry(NaN, base)).toBeNull();
    expect(computeExpiry(-1, base)).toBeNull();
  });

  it('returns base + days', () => {
    const base = new Date('2026-01-01T00:00:00Z');
    const out = computeExpiry(7, base);
    expect(out).not.toBeNull();
    expect(out!.toISOString()).toBe('2026-01-08T00:00:00.000Z');
  });

  it('defaults the base to "now" when not given', () => {
    const out = computeExpiry(1);
    const expected = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(out!.getTime()).toBeGreaterThan(expected.getTime() - 5000);
    expect(out!.getTime()).toBeLessThan(expected.getTime() + 5000);
  });
});
