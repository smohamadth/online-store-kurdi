import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getStoreInfo, buildMetadata } from '@/lib/seo';
import { serverFetch } from '@/lib/serverFetch';
import { encodeRouteParam } from '@/lib/routeParam';

/**
 * Renders an admin-authored page at /p/<slug>.
 *
 * A SERVER component on purpose: an unknown or draft slug must return a real
 * HTTP 404, and notFound() only sets the status before the response is
 * committed. See KNOWN_GAPS.md section 7 for the streaming caveat - the
 * middleware handles the storefront's dynamic routes, and this route is listed
 * there too.
 *
 * Server-side API calls go through lib/serverFetch, which retries across
 * loopback spellings when one address family is dead (see KNOWN_GAPS.md §9).
 */

interface Page {
  slug: string;
  title: string;
  content: string;
  excerpt?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  updatedAt: string;
}

/**
 * Fetch the page, or null when it definitively does not exist.
 *
 * ONLY the API's explicit 404 (or a 200 with no data) means "not found":
 * unknown slug and pulled-back draft are indistinguishable by design. Any
 * OTHER failure - API down, 500, rate limited - THROWS instead of returning
 * null: collapsing those into null rendered "Page not found" for pages that
 * were published and fine, which is precisely how "my page 404s after
 * publishing" got reported repeatedly with a backend hiccup as the real
 * cause. Callers catch the throw and render an explicit temporary-error view
 * (a thrown error during a streamed render would land in the root not-found
 * boundary in Next 14, recreating the false 404).
 */
async function getPage(slug: string): Promise<Page | null> {
  let res: Response;
  try {
    // no-store: an edit must be visible on the next load, and a page pulled
    // back to draft must stop being served immediately. serverFetch falls
    // back across loopback spellings when one address family is dead.
    res = await serverFetch(`/pages/slug/${encodeRouteParam(slug)}`, {
      cache: 'no-store',
    });
  } catch (err) {
    console.error(`[/p/${slug}] store API unreachable:`, err);
    throw new Error('The store API is unreachable.');
  }

  if (res.status === 404) return null;

  if (!res.ok) {
    console.error(`[/p/${slug}] store API returned ${res.status}`);
    throw new Error(`Store API error (${res.status}).`);
  }

  const body = await res.json().catch(() => null);
  return body?.data || null;
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  // Tolerant on purpose: a metadata failure must not take the page down with
  // it. Next 14 renders the root not-found fallback when generateMetadata
  // throws during a streamed render - which turns a backend hiccup into a
  // false "Page not found". getPage() throws only on API failure, so catch
  // that here and let the page component decide what the user sees.
  let page: Page | null = null;
  let store: Awaited<ReturnType<typeof getStoreInfo>> | null = null;
  let upstream = false;
  try {
    [page, store] = await Promise.all([getPage(params.slug), getStoreInfo()]);
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
    path: `/p/${page.slug}`,
    storeName: storeInfo.storeName,
  });
}

export default async function CustomPage({ params }: { params: { slug: string } }) {
  // Only a definitive 404 (unknown slug or draft) may show "Page not found".
  // An upstream failure renders an explicit temporary-error view instead -
  // collapsing it into notFound() is what made published pages "vanish"
  // whenever the API hiccuped.
  let page: Page | null;
  try {
    page = await getPage(params.slug);
  } catch (err) {
    return (
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '72px 20px', textAlign: 'center' }}>
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
          The store server failed to answer, so the page cannot be shown right now. It may well
          exist — this is a temporary error, not a missing page. Please try again in a moment.
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
        <p style={{ marginTop: '12px', fontSize: '17px', color: 'var(--muted, #666)', lineHeight: 1.6 }}>
          {page.excerpt}
        </p>
      )}

      <div
        data-page-content
        style={{
          marginTop: '28px',
          fontSize: '16px',
          lineHeight: 1.75,
        }}
        // Sanitised server-side on write (see pages/page.routes.ts), never on
        // read - so nothing dangerous is ever stored.
        dangerouslySetInnerHTML={{ __html: page.content || '' }}
      />

      <p style={{ marginTop: '40px', fontSize: '13px', color: 'var(--muted, #888)' }}>
        Last updated {new Date(page.updatedAt).toLocaleDateString()}
      </p>
    </article>
  );
}
