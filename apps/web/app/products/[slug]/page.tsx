import { notFound } from 'next/navigation';
import ProductView from './ProductView';
import { serverFetch } from '@/lib/serverFetch';
import { encodeRouteParam } from '@/lib/routeParam';

/**
 * Server component for /products/<slug>.
 *
 * Exists so an unknown product returns a REAL HTTP 404 instead of rendering
 * the "not found" page with status 200 (a soft 404, which search engines may
 * index rather than drop). `notFound()` only sets the status when it runs on
 * the server, before the response is committed.
 *
 * All interactivity — gallery, variants, add-to-cart, reviews — stays in
 * ProductView, which is still a client component. Nothing about the page's
 * appearance changed.
 *
 * NOTE: API_BASE comes from lib/apiBase, NOT lib/http. The latter is
 * `'use client'`, and importing a value from it here yields a client-reference
 * Symbol instead of a string, throwing "Cannot convert a Symbol value to a
 * string" inside the fetch — which this function's catch would swallow,
 * silently disabling the 404.
 */

async function productExists(slug: string): Promise<boolean | null> {
  try {
    // no-store: a cached 404 would keep a newly published product hidden, and
    // a cached hit would keep a deleted one reachable.
    const res = await serverFetch(`/products/slug/${encodeRouteParam(slug)}`, {
      cache: 'no-store',
    });
    if (res.status === 404) return false;
    if (!res.ok) return null; // API error — don't 404 a page that may be valid
    return true;
  } catch {
    // API unreachable: let the client view load and retry rather than showing
    // a 404 for a product that probably exists.
    return null;
  }
}

export default async function ProductPage({ params }: { params: { slug: string } }) {
  const exists = await productExists(params.slug);

  if (exists === false) notFound();

  return <ProductView />;
}
