import type { Metadata } from 'next';
import { serverFetch } from './serverFetch';

/**
 * Shared helpers for server-side metadata.
 *
 * Every page previously declared SEO with next/head inside a client
 * component, which is a no-op in the App Router — none of those tags reached
 * the HTML. These helpers run on the server via generateMetadata.
 *
 * `buildMetadata` is the canonical entry point. It produces a complete
 * Metadata object: title, description, canonical URL, Open Graph
 * (with image + locale + site_name), Twitter card (with image),
 * and a robots directive. Pass `index: false` to mark the page
 * noindex (e.g. cart / checkout / account).
 */

// getStoreInfo fetches via serverFetch (loopback fallbacks) - see lib/serverFetch.ts.
export const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export interface StoreInfo {
  storeName: string;
  storeDescription: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  storeEmail?: string | null;
  storePhone?: string | null;
  storeAddress?: string | null;
  googleAnalyticsId?: string | null;
}

export async function getStoreInfo(): Promise<StoreInfo> {
  const fallback: StoreInfo = {
    storeName: 'Online Store',
    storeDescription: 'Shop the latest products at great prices.',
  };
  try {
    const res = await serverFetch('/settings', { next: { revalidate: 300 } } as RequestInit);
    if (!res.ok) return fallback;
    const d = (await res.json()).data || {};
    return {
      storeName: d.storeName || fallback.storeName,
      storeDescription: d.storeDescription || fallback.storeDescription,
      metaTitle: d.metaTitle,
      metaDescription: d.metaDescription,
      storeEmail: d.storeEmail,
      storePhone: d.storePhone,
      storeAddress: d.storeAddress,
      googleAnalyticsId: d.googleAnalyticsId,
    };
  } catch {
    return fallback;
  }
}

/**
 * Build the inline gtag() bootstrap for a GA4/Universal property id.
 * Pure so the root layout and its tests agree on the emitted JS.
 * Returns '' for anything that doesn't look like a GA id
 * (G-XXXX, UA-XXXX-1) so a garbage value can never inject a
 * malformed snippet into every page.
 */
export function buildGtagSnippet(gaId: string | null | undefined): string {
  if (!gaId) return '';
  if (!/^[A-Z]{1,2}-[0-9A-Za-z-]+$/.test(gaId)) return '';
  return (
    `window.dataLayer=window.dataLayer||[];` +
    `function gtag(){dataLayer.push(arguments);}gtag('js',new Date());` +
    `gtag('config','${gaId}');`
  );
}

/** Build an absolute image URL. Relative paths get the API origin
 *  prepended; absolute URLs are returned as-is. Returns undefined
 *  for falsy input so the caller can spread conditionally. */
export function absoluteImageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  // The API serves images from the same origin as the API URL,
  // but without the /api path. E.g. /uploads/x.jpg on
  // http://api.example.com/api becomes http://api.example.com/uploads/x.jpg.
  const apiOrigin = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api')
    .replace(/\/api\/?$/, '');
  return `${apiOrigin}${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
 * Build a consistent Metadata object.
 *
 * The defaults are conservative: OG type 'website', Twitter card
 * 'summary_large_image', robots { index, follow } - override any of
 * these via the corresponding option if a page needs a different
 * shape (e.g. articles use 'article' for og:type and a Twitter
 * 'summary' card without an image).
 */
export interface BuildMetadataOptions {
  title: string;
  description: string;
  path: string;
  storeName: string;
  /** Canonical path; defaults to `path`. Use when the same content
   *  is served at multiple URLs (e.g. query-param variants). */
  canonicalPath?: string;
  /** og:type, default 'website'. The Next.js OpenGraph type
   *  union only allows 'website' | 'article' | 'profile', so
   *  'product' is also accepted here and emitted through the
   *  type assertion below. */
  ogType?: 'website' | 'article' | 'product' | 'profile';
  /** Image URL (absolute). Twitter / Open Graph will both pick
   *  this up if supplied. */
  image?: string | null;
  /** Open Graph locale, default 'en_US'. */
  locale?: string;
  /** Set to false to mark the page noindex. Cart, checkout,
   *  account, and login do this. */
  index?: boolean;
  /** Set to false to stop crawlers following links off the page. */
  follow?: boolean;
  /** Article-specific: published time (ISO 8601). */
  publishedTime?: string;
  /** Article-specific: modified time (ISO 8601). */
  modifiedTime?: string;
  /** Article-specific: author name. */
  author?: string;
  /** Article-specific: section / category. */
  section?: string;
  /** Article-specific: tags. */
  tags?: string[];
}

export function buildMetadata(opts: BuildMetadataOptions): Metadata {
  const url = `${SITE}${opts.canonicalPath || opts.path}`;
  const image = absoluteImageUrl(opts.image);
  // Cast to any when emitting the type so 'product' (which Next
  // doesn't include in the OpenGraph union) round-trips.
  // Next.js 14.2 validates og:type against a fixed allowlist at REQUEST
  // time (website, article, book, profile, music.*, video.*) and throws
  // "Invalid OpenGraph type: product" for anything else - 500ing the whole
  // page even though 'product' is legal in the OG protocol. Emit
  // 'website' instead; the product semantics travel in the `product:*`
  // keys the caller adds via `other` (that's what the rich-preview
  // scrapers read).
  const ogType =
    opts.ogType === 'product' ? 'website' : (opts.ogType || 'website');
  const index = opts.index !== false;
  const follow = opts.follow !== false;

  // Build robots as a typed object so the test assertions can
  // read .index / .follow / .googleBot. `next` types the field
  // as `string | Robots`; we always emit the object form.
  const robots = {
    index,
    follow,
    googleBot: { index, follow },
  } as const;

  // The OpenGraph type the helper emits is a superset of what
  // Next's Metadata type allows (we include 'product'). The
  // shape of every other field matches. The spread keeps the
  // helper signature a single function call.
  const meta: Metadata = {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: url },
    openGraph: {
      title: opts.title,
      description: opts.description,
      url,
      siteName: opts.storeName,
      type: ogType as 'website' | 'article' | 'profile',
      locale: opts.locale || 'en_US',
      ...(image ? { images: [{ url: image, alt: opts.title }] } : {}),
      ...(ogType === 'article'
        ? {
            publishedTime: opts.publishedTime,
            modifiedTime: opts.modifiedTime,
            authors: opts.author ? [opts.author] : undefined,
            section: opts.section,
            tags: opts.tags,
          }
        : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title: opts.title,
      description: opts.description,
      ...(image ? { images: [image] } : {}),
    } as any,
    robots: robots as any,
  };

  return meta;
}

/**
 * Build a noindex metadata for pages that should never appear in
 * search results (cart, checkout, account, login, 404). Same shape
 * as buildMetadata but with index=false and follow=false, and
 * no image / OG variants.
 */
export function buildNoindexMetadata(opts: {
  title: string;
  description?: string;
  path?: string;
  storeName?: string;
}): Metadata {
  return buildMetadata({
    ...opts,
    description: opts.description ?? '',
    path: opts.path ?? '/',
    storeName: opts.storeName ?? '',
    index: false,
    follow: false,
  });
}
