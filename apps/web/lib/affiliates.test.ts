/**
 * Unit tests for the affiliate client's pure helpers (lib/affiliates.ts).
 * The I/O functions are exercised through the component tests and the API
 * integration suite; only the pure link builder lives here.
 */
import { describe, it, expect } from 'vitest';
import { buildAffiliateLink } from './affiliates';

describe('buildAffiliateLink', () => {
  it('builds ?ref= links against the current origin', () => {
    // happy-dom pins the origin; same-origin replaceState keeps it stable.
    window.history.replaceState({}, '', '/some/page');
    expect(buildAffiliateLink('MARTIN-7K2F')).toBe(`${window.location.origin}/?ref=MARTIN-7K2F`);
  });

  it('keeps the code URL-safe', () => {
    window.history.replaceState({}, '', '/');
    expect(buildAffiliateLink('KURD X/1')).toBe(`${window.location.origin}/?ref=KURD%20X%2F1`);
  });
});
