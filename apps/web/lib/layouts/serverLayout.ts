// ---------------------------------------------------------------------------
// serverLayout — resolve a page's Theme Studio layout server-side.
//
// Server-rendered pages (blog, blog post, CMS pages) resolve the ACTIVE
// theme's `layouts.<page>` before rendering so the layout is in the initial
// HTML (important for SEO pages). We read the active theme from the public
// /api/theme endpoint (the same one the storefront uses), then look it up in
// the registry.
//
// Safe to call from server components only (uses serverFetch).
// ---------------------------------------------------------------------------
import { serverFetch } from '@/lib/serverFetch';
import { getTheme } from '@/lib/themeRegistry';
import type { PageKey, PageLayout } from './types';

/** Resolve the active theme's layout for a page, or undefined if none. */
export async function getServerPageLayout(page: PageKey): Promise<PageLayout | undefined> {
  try {
    const res = await serverFetch('/theme', { cache: 'no-store' });
    if (!res.ok) return undefined;
    const body = await res.json();
    const activeTheme = body?.data?.activeTheme as string | null | undefined;
    if (!activeTheme) return undefined;
    const layout = getTheme(activeTheme)?.layouts?.[page] as PageLayout | undefined;
    if (layout && Array.isArray(layout.blocks) && layout.blocks.length > 0) return layout;
    return undefined;
  } catch {
    return undefined;
  }
}
