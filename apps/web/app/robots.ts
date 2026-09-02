import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/seo';

/**
 * Dynamic robots.txt.
 *
 * The previous static file (public/robots.txt) hard-coded
 * 'https://yourstore.com' as the sitemap URL. Whatever the
 * deployment hostname, crawlers saw the same broken link, so
 * every search engine that honoured robots.txt was looking
 * for a sitemap that didn't exist.
 *
 * This file lives at /robots.txt via the App Router and reads
 * the same SITE constant that the rest of the app uses, so
 * the sitemap reference is always correct. The other rules
 * (Disallow /admin, /api, /cart, /account, /checkout, /login)
 * are the same as the static version; the `dynamic = 'force-dynamic'`
 * flag is what makes Next actually read this on each request
 * instead of prerendering it at build time.
 *
 * Why not in lib/robots: this is a Next.js route handler
 * shape, not a pure data file. Keeping it under app/ matches
 * the convention every other Next-aware SEO file uses
 * (sitemap.ts sits next to it).
 */
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          // Admin / API endpoints: not useful for search, and
          // can leak inventory / customer data if indexed.
          '/admin',
          '/admin/*',
          '/api',
          '/api/*',
          // User-private areas: never useful in search results.
          '/cart',
          '/checkout',
          '/checkout/*',
          '/account',
          '/account/*',
          '/login',
          '/logout',
          '/forgot-password',
          // Next.js internals.
          '/_next',
          '/_next/*',
        ],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
