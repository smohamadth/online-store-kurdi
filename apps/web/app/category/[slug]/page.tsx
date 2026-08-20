import { notFound } from 'next/navigation';
import CategoryView from './CategoryView';
import { API_BASE } from '@/lib/apiBase';
import { encodeRouteParam } from '@/lib/routeParam';

/**
 * Server component for /category/<slug>.
 *
 * This exists so an unknown category returns a REAL HTTP 404. Previously the
 * page was a client component calling notFound(), which rendered
 * not-found.tsx but left the status at 200 — a "soft 404" that search engines
 * may index instead of dropping. notFound() only sets the status when it runs
 * on the server, before the response is committed.
 *
 * All interactivity (sorting, paging, filter links) lives in CategoryView,
 * which is still a client component.
 */

async function categoryExists(slug: string): Promise<boolean | null> {
  try {
    // no-store: a cached 404 would keep a newly created category hidden, and
    // a cached hit would keep a deleted one reachable.
    const res = await fetch(`${API_BASE}/categories/${encodeRouteParam(slug)}`, {
      cache: 'no-store',
    });
    if (res.status === 404) return false;
    if (!res.ok) return null; // API error — don't 404 a possibly valid page
    return true;
  } catch (e) {
    console.log('[probe] threw:', (e as Error)?.message);
    // API unreachable: fall through and let the client view retry rather than
    // showing a 404 for a category that probably exists.
    return null;
  }
}

export default async function CategoryPage({ params }: { params: { slug: string } }) {
  const exists = await categoryExists(params.slug);
  console.log('[probe] cat', params.slug, 'base=', API_BASE, 'exists=', exists);

  if (exists === false) notFound();

  return <CategoryView slug={params.slug} />;
}
