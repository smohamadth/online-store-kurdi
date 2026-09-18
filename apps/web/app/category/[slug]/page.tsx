import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import CategoryView from './CategoryView';
import { serverFetch } from '@/lib/serverFetch';
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
 *
 * CategoryView calls useSearchParams(). Without an explicit <Suspense>
 * boundary Next.js supplies an implicit one around the whole route, and the
 * prerendered HTML then mismatched the client on hydration — React error #425
 * ("server rendered HTML didn't match the client") in the browser console on
 * every /category/<slug> view. /products already wraps its equivalent client
 * view this way; this mirrors it.
 */

async function categoryExists(slug: string): Promise<boolean | null> {
  try {
    // no-store: a cached 404 would keep a newly created category hidden, and
    // a cached hit would keep a deleted one reachable.
    const res = await serverFetch(`/categories/${encodeRouteParam(slug)}`, {
      cache: 'no-store',
    });
    if (res.status === 404) return false;
    if (!res.ok) return null; // API error — don't 404 a possibly valid page
    return true;
  } catch {
    // API unreachable: fall through and let the client view retry rather than
    // showing a 404 for a category that probably exists.
    return null;
  }
}

export default async function CategoryPage({ params }: { params: { slug: string } }) {
  const exists = await categoryExists(params.slug);

  if (exists === false) notFound();

  return (
    <Suspense fallback={<CategoryLoading />}>
      <CategoryView slug={params.slug} />
    </Suspense>
  );
}

/** Static placeholder — deliberately free of hooks so the boundary is stable. */
function CategoryLoading() {
  return <div style={{ textAlign: 'center', padding: '64px', color: 'var(--muted, #666)' }} />;
}
