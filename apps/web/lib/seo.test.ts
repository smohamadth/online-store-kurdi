/**
 * seo.ts — server-side metadata builder.
 *
 * Tests:
 *   - SITE is taken from NEXT_PUBLIC_SITE_URL when set
 *   - buildMetadata produces canonical, OG, Twitter metadata
 *   - image presence flips the Twitter card type
 *   - index: false emits a noindex directive
 *   - buildNoindexMetadata is a thin convenience wrapper
 *   - absoluteImageUrl handles relative, absolute, and falsy inputs
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
  it('produces a complete metadata object (no image)', () => {
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
      // No image supplied -> the smaller Twitter card. (The product
      // case is covered by the PDP test; the goal here is the
      // default behaviour, not the image branch.)
      expect((m.twitter as any)?.card).toBe('summary');
      expect(m.openGraph?.images).toBeUndefined();
      expect(m.twitter?.images).toBeUndefined();
      const r = m.robots as any;
      expect(r.index).toBe(true);
      expect(r.follow).toBe(true);
      // googleBot mirrors index / follow so we don't depend on
      // Google's older noindex string form.
      expect(r.googleBot?.index).toBe(true);
      expect(r.googleBot?.follow).toBe(true);
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
      const r = m.robots as any;
      expect(r.index).toBe(false);
      expect(r.follow).toBe(true);
      expect(r.googleBot?.index).toBe(false);
    });
  });

  it('honours follow: false (private pages that should not leak PageRank)', () => {
    return import('./seo').then(({ buildMetadata }) => {
      const m = buildMetadata({
        title: 'Secret',
        description: 'd',
        path: '/p',
        storeName: 's',
        follow: false,
      });
      expect((m.robots as any).follow).toBe(false);
    });
  });

  it('attaches an OG image + Twitter large card when an image is supplied', () => {
    return import('./seo').then(({ buildMetadata }) => {
      const m = buildMetadata({
        title: 'Hat',
        description: 'd',
        path: '/p',
        storeName: 's',
        image: 'https://cdn.example.com/hat.jpg',
      });
      expect(m.openGraph?.images).toEqual([
        { url: 'https://cdn.example.com/hat.jpg', alt: 'Hat' },
      ]);
      expect((m.twitter as any).card).toBe('summary_large_image');
      expect(m.twitter?.images).toEqual(['https://cdn.example.com/hat.jpg']);
    });
  });

  it('accepts a custom canonicalPath separately from the rendered path', () => {
    return import('./seo').then(({ buildMetadata }) => {
      const m = buildMetadata({
        title: 't',
        description: 'd',
        path: '/products/hat?variant=red',
        canonicalPath: '/products/hat',
        storeName: 's',
      });
      expect(m.alternates?.canonical).toBe('https://example.com/products/hat');
      // og:url is also the canonical.
      expect(m.openGraph?.url).toBe('https://example.com/products/hat');
    });
  });

  it('sets og:locale by default (en_US) and accepts an override', () => {
    return import('./seo').then(({ buildMetadata }) => {
      const m1 = buildMetadata({ title: 't', description: 'd', path: '/p', storeName: 's' });
      expect(m1.openGraph?.locale).toBe('en_US');
      const m2 = buildMetadata({ title: 't', description: 'd', path: '/p', storeName: 's', locale: 'fr_FR' });
      expect(m2.openGraph?.locale).toBe('fr_FR');
    });
  });

  it('accepts ogType=article and emits article-specific OG fields', () => {
    return import('./seo').then(({ buildMetadata }) => {
      const m = buildMetadata({
        title: 'Hello world',
        description: 'd',
        path: '/blog/hello',
        storeName: 's',
        ogType: 'article',
        publishedTime: '2026-01-01T00:00:00Z',
        modifiedTime: '2026-01-15T00:00:00Z',
        author: 'Alice',
        section: 'News',
        tags: ['launch', 'news'],
      });
      const og = m.openGraph as any;
      expect(og.type).toBe('article');
      expect(og.publishedTime).toBe('2026-01-01T00:00:00Z');
      expect(og.modifiedTime).toBe('2026-01-15T00:00:00Z');
      expect(og.authors).toEqual(['Alice']);
      expect(og.section).toBe('News');
      expect(og.tags).toEqual(['launch', 'news']);
    });
  });
});

describe('buildNoindexMetadata', () => {
  it('produces a noindex+follow metadata object', () => {
    return import('./seo').then(({ buildNoindexMetadata }) => {
      const m = buildNoindexMetadata({
        title: 'Cart',
        description: 'Your cart',
        path: '/cart',
        storeName: 's',
      });
      expect(m.title).toBe('Cart');
      const r = m.robots as any;
      expect(r.index).toBe(false);
      expect(r.follow).toBe(false);
    });
  });
});

describe('absoluteImageUrl', () => {
  it('returns undefined for falsy input', () => {
    return import('./seo').then(({ absoluteImageUrl }) => {
      expect(absoluteImageUrl(undefined)).toBeUndefined();
      expect(absoluteImageUrl(null)).toBeUndefined();
      expect(absoluteImageUrl('')).toBeUndefined();
    });
  });

  it('passes through absolute http and https URLs', () => {
    return import('./seo').then(({ absoluteImageUrl }) => {
      expect(absoluteImageUrl('https://cdn.example.com/x.jpg')).toBe(
        'https://cdn.example.com/x.jpg',
      );
      expect(absoluteImageUrl('http://example.com/x.jpg')).toBe('http://example.com/x.jpg');
    });
  });

  it('prefixes a relative URL with the API origin (without /api)', () => {
    const apiBefore = process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_URL = 'http://api.example.com/api';
    return import('./seo').then(({ absoluteImageUrl }) => {
      // A leading slash on the relative path is kept (joined without
      // a doubled slash). The helper emits the API origin minus its
      // trailing /api.
      expect(absoluteImageUrl('/uploads/x.jpg')).toBe('http://api.example.com/uploads/x.jpg');
      expect(absoluteImageUrl('uploads/x.jpg')).toBe('http://api.example.com/uploads/x.jpg');
      if (apiBefore === undefined) delete process.env.NEXT_PUBLIC_API_URL;
      else process.env.NEXT_PUBLIC_API_URL = apiBefore;
    });
  });
});
