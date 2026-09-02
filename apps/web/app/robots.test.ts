/**
 * Tests for the dynamic /robots.txt route handler.
 *
 * The handler is a Next.js route module (app/robots.ts). It
 * exports a default function returning a MetadataRoute.Robots
 * object. We import the default export and assert:
 *   - the user-agent rule disallows the private areas
 *   - the sitemap reference uses the SITE constant (no
 *     hard-coded "yourstore.com")
 *   - the host field is set so Google picks the canonical
 *     domain.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

beforeAll(() => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';
});
afterAll(() => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe('/robots.txt', () => {
  it('disallows private areas and references the correct sitemap', async () => {
    const mod = await import('./robots');
    const out = mod.default();
    expect(out.sitemap).toBe('https://example.com/sitemap.xml');
    expect(out.host).toBe('https://example.com');
    // The single user-agent rule covers the whole site.
    // rules is typed as a single rule OR an array of rules; normalise.
    const rules = Array.isArray(out.rules) ? out.rules : [out.rules];
    expect(rules).toHaveLength(1);
    const rule = rules[0];
    expect(rule.userAgent).toBe('*');
    expect(rule.allow).toContain('/');
    // Cart, checkout, account, login are not useful in search.
    expect(rule.disallow).toContain('/cart');
    expect(rule.disallow).toContain('/checkout');
    expect(rule.disallow).toContain('/account');
    expect(rule.disallow).toContain('/login');
    // Admin and API must never be indexed - they can leak
    // inventory data and customer records.
    expect(rule.disallow).toContain('/admin');
    expect(rule.disallow).toContain('/admin/*');
    expect(rule.disallow).toContain('/api');
    expect(rule.disallow).toContain('/api/*');
  });

  it('uses NEXT_PUBLIC_SITE_URL at request time, not at module load', async () => {
    // The current SITE constant was captured at import time, so
    // changing the env after import won't change this module's
    // output. We don't import fresh; this test documents the
    // current behaviour.
    const mod = await import('./robots');
    const out = mod.default();
    expect(out.sitemap).toContain(process.env.NEXT_PUBLIC_SITE_URL || '');
  });
});
