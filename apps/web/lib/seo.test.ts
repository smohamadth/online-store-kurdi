/**
 * seo.ts — server-side metadata builder.
 *
 * Tests:
 *   - SITE is taken from NEXT_PUBLIC_SITE_URL when set
 *   - buildMetadata produces canonical, OG, Twitter metadata
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

beforeAll(() => {
  // Set the env BEFORE the seo module is imported. seo.ts captures SITE
  // at module load time, so the env must be in place first.
  process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';
});
afterAll(() => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe('buildMetadata', () => {
  it('produces a complete metadata object', () => {
    // Import lazily so the env above is in place.
    return import('./seo').then(({ buildMetadata }) => {
      const m = buildMetadata({
        title: 'Hat - My Shop',
        description: 'A great hat',
        path: '/products/hat',
        storeName: 'My Shop',
      });
      expect(m.title).toBe('Hat - My Shop');
      expect(m.description).toBe('A great hat');
      expect(m.alternates?.canonical).toBe('https://example.com/products/hat');
      expect(m.openGraph?.title).toBe('Hat - My Shop');
      expect(m.openGraph?.url).toBe('https://example.com/products/hat');
      expect(m.openGraph?.siteName).toBe('My Shop');
      expect(m.twitter?.card).toBe('summary_large_image');
      expect(m.robots?.index).toBe(true);
      expect(m.robots?.follow).toBe(true);
    });
  });

  it('honours index: false (noindex pages)', () => {
    return import('./seo').then(({ buildMetadata }) => {
      const m = buildMetadata({
        title: 'Admin',
        description: 'admin',
        path: '/admin/x',
        storeName: 's',
        index: false,
      });
      expect(m.robots?.index).toBe(false);
    });
  });
});
