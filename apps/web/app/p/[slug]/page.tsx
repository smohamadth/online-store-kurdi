import { notFound, permanentRedirect } from 'next/navigation';
import { serverFetch } from '@/lib/serverFetch';
import { encodeRouteParam } from '@/lib/routeParam';

/**
 * /p/<slug> — backwards-compatibility dispatcher.
 *
 * Before the type-aware page model landed, every CMS page
 * lived at /p/<slug>. The new URLs are
 *   /info/<slug>, /legal/<slug>, /help/<slug>
 * picked by the page's `pageType` column. Old links still
 * arrive at /p/<slug> (footer, sitemap, customer-support
 * emails, social posts) so this route looks up the page and
 * 301-redirects to its new address. Once the merchant
 * confirms the migration, this file can be deleted.
 *
 * Edge case: an unknown slug or a draft surfaces as a real
 * 404 via notFound(). The page was not just redirected to a
 * different URL — it doesn't exist.
 */

interface PageSummary {
  pageType: 'info' | 'legal' | 'help';
  status: string;
}

async function findType(slug: string): Promise<PageSummary | null> {
  let res: Response;
  try {
    // Hit the legacy slug-only endpoint. It returns the full
    // row, so we can read the pageType off it.
    res = await serverFetch(`/pages/slug/${encodeRouteParam(slug)}`, {
      cache: 'no-store',
    });
  } catch {
    // The API is down. Don't 301 to a URL we can't verify;
    // let the framework 404 instead.
    return null;
  }
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  return body?.data || null;
}

export default async function LegacyPageDispatcher({
  params,
}: {
  params: { slug: string };
}) {
  const page = await findType(params.slug);
  if (!page) notFound();

  permanentRedirect(`/${page.pageType}/${params.slug}`);
}
