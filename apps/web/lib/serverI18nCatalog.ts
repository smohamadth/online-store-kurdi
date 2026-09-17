/**
 * Server-side loader for the admin-editable storefront string catalog.
 *
 * The client i18n hook used to fetch GET /api/i18n/storefront in a mount
 * effect and swap the overlay in afterwards. That changed the rendered text
 * AFTER hydration, so the server HTML and the first client render disagreed —
 * React error #425 on every translated page (/products, /category/<slug>).
 *
 * Loading it here lets the root layout seed the catalog into the client, so
 * the first client render already has the same strings the server used.
 *
 * Never throws: a store whose API is down must still render (with the
 * built-in dictionaries), exactly as before.
 */
import { serverFetch } from './serverFetch';
import type { StorefrontI18nCatalog } from './i18n';

export async function loadStorefrontI18nCatalog(): Promise<StorefrontI18nCatalog | null> {
  try {
    // no-store: the admin can edit these strings at any time, and a cached
    // copy would keep the old wording on the server while the client (which
    // no longer refetches) shows the same stale text.
    const res = await serverFetch('/i18n/storefront', { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.data as StorefrontI18nCatalog) ?? null;
  } catch {
    return null;
  }
}
