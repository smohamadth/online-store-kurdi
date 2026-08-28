import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getStoreInfo, buildMetadata } from '@/lib/seo';
import { serverFetch } from '@/lib/serverFetch';
import { encodeRouteParam } from '@/lib/routeParam';
import { PageBlocks } from '@/components/PageBlocks';
import type { PageBlock } from '@/lib/pageBlocks';

/**
 * Shared renderer for the type-aware CMS pages.
 *
 * The three routes /info/[slug], /legal/[slug] and /help/[slug]
 * all delegate to this component. The wrapper route passes in
 * its own `pageType` so the API can be queried with the type
 * baked in (`/api/pages/by-type/<type>/slug/<slug>`); a row
 * whose stored type doesn't match the URL is rejected as 404,
 * so a stale link in an old email campaign never renders the
 * wrong content.
 *
 * Kept in `app/_components/` (the underscore-prefixed name
 * tells Next.js not to treat the folder as a route) so the
 * renderer is shared across the three URL segments without
 * introducing a public `/components/...` path.
 */

export type PageType = 'info' | 'legal' | 'help';

export const PAGE_TYPES: readonly PageType[] = ['info', 'legal', 'help'] as const;

export interface Page {
  slug: string;
  pageType: PageType;
  title: string;
  content: string;
  excerpt?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  /** Layout blocks, or null/absent for pages saved before blocks existed. */
  blocks?: PageBlock[] | null;
  updatedAt: string;
}

/**
 * Fetch the page, or null when it definitively does not exist.
 *
 * ONLY the API's explicit 404 (or a 200 with no data) means
 * "not found": unknown slug, pulled-back draft, and
 * type-mismatch are all indistinguishable by design. Any OTHER
 * failure - API down, 500, rate limited - THROWS instead of
 * returning null: collapsing those into null rendered
 * "Page not found" for pages that were published and fine,
 * which is precisely how "my page 404s after publishing" got
 * reported repeatedly with a backend hiccup as the real cause.
 */
export async function getPage(
  pageType: PageType,
  slug: string,
): Promise<Page | null> {
  let res: Response;
  try {
    res = await serverFetch(
      `/pages/by-type/${encodeRouteParam(pageType)}/slug/${encodeRouteParam(slug)}`,
      { cache: 'no-store' },
    );
  } catch (err) {
    console.error(`[/${pageType}/${slug}] store API unreachable:`, err);
    throw new Error('The store API is unreachable.');
  }

  if (res.status === 404) return null;

  if (!res.ok) {
    console.error(`[/${pageType}/${slug}] store API returned ${res.status}`);
    throw new Error(`Store API error (${res.status}).`);
  }

  const body = await res.json().catch(() => null);
  return body?.data || null;
}

/**
 * Build the <Metadata> for a type-aware page. Tolerant on
 * purpose: a metadata failure must not take the page down
 * with it. Next 14 renders the root not-found fallback when
 * generateMetadata throws during a streamed render, which
 * turns a backend hiccup into a false "Page not found".
 */
export async function generatePageMetadata(
  pageType: PageType,
  slug: string,
): Promise<Metadata> {
  let page: Page | null = null;
  let store: Awaited<ReturnType<typeof getStoreInfo>> | null = null;
  let upstream = false;
  try {
    [page, store] = await Promise.all([getPage(pageType, slug), getStoreInfo()]);
  } catch {
    upstream = true;
  }

  if (upstream) {
    return {
      title: 'Temporarily unavailable',
      robots: { index: false, follow: true },
    };
  }

  if (!page) {
    return { title: 'Page not found', robots: { index: false, follow: true } };
  }

  const storeInfo = store!;
  const description =
    page.metaDescription?.trim() ||
    page.excerpt?.trim() ||
    `${page.title} — ${storeInfo.storeName}`;

  return buildMetadata({
    title: page.metaTitle?.trim() || `${page.title} | ${storeInfo.storeName}`,
    description,
    path: `/${pageType}/${page.slug}`,
    storeName: storeInfo.storeName,
  });
}

/**
 * Render a type-aware page. The error and 404 handling mirrors
 * the old `/p/<slug>` renderer: a definitive 404 calls
 * notFound() (so Next.js returns a real 404 status), an
 * upstream failure renders an explicit temporary-error view.
 */
export async function renderPage(
  pageType: PageType,
  slug: string,
): Promise<React.ReactElement> {
  let page: Page | null;
  try {
    page = await getPage(pageType, slug);
  } catch (err) {
    return (
      <div
        style={{
          maxWidth: '760px',
          margin: '0 auto',
          padding: '72px 20px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '44px' }}>⚠️</div>
        <h1
          style={{
            fontSize: '28px',
            fontWeight: 'var(--heading-weight, 800)' as any,
            marginTop: '14px',
            letterSpacing: '-0.02em',
          }}
        >
          This page could not be loaded
        </h1>
        <p
          style={{
            marginTop: '12px',
            fontSize: '16px',
            color: 'var(--muted, #666)',
            lineHeight: 1.6,
          }}
        >
          The store server failed to answer, so the page cannot be shown right now. It
          may well exist — this is a temporary error, not a missing page. Please try
          again in a moment.
        </p>
        {process.env.NODE_ENV !== 'production' && (
          <p style={{ marginTop: '14px', fontSize: '13px', color: '#999' }}>
            Technical detail: {err instanceof Error ? err.message : String(err)}
          </p>
        )}
      </div>
    );
  }

  if (!page) notFound();

  return (
    <article
      style={{
        maxWidth: '760px',
        margin: '0 auto',
        padding: '56px 20px 72px',
        color: 'var(--body-text, #111)',
      }}
    >
      <h1
        style={{
          fontSize: '34px',
          fontWeight: 'var(--heading-weight, 800)' as any,
          letterSpacing: '-0.02em',
          lineHeight: 1.15,
        }}
      >
        {page.title}
      </h1>

      {page.excerpt && (
        <p
          style={{
            marginTop: '12px',
            fontSize: '17px',
            color: 'var(--muted, #666)',
            lineHeight: 1.6,
          }}
        >
          {page.excerpt}
        </p>
      )}

      {page.blocks && page.blocks.length > 0 ? (
        // Block layout. The admin composed this page from blocks; the
        // HTML fields were sanitised server-side on write exactly like
        // `content` (see pages/page.routes.ts serializeBlocks).
        <div data-page-content style={{ marginTop: '28px', fontSize: '16px' }}>
          <PageBlocks blocks={page.blocks} />
        </div>
      ) : (
        <div
          data-page-content
          style={{
            marginTop: '28px',
            fontSize: '16px',
            lineHeight: 1.75,
          }}
          // Legacy single-column page. Sanitised server-side on write,
          // never on read - so nothing dangerous is ever stored.
          dangerouslySetInnerHTML={{ __html: page.content || '' }}
        />
      )}

      <p style={{ marginTop: '40px', fontSize: '13px', color: 'var(--muted, #888)' }}>
        Last updated {new Date(page.updatedAt).toLocaleDateString()}
      </p>
    </article>
  );
}
