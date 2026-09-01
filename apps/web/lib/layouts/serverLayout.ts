// ---------------------------------------------------------------------------
// serverLayout — resolve a page's Theme Studio layout server-side.
//
// Server-rendered pages (blog, blog post, CMS pages) resolve the ACTIVE
// theme's `layouts.<page>` before rendering so the layout is in the initial
// HTML (important for SEO pages). We read the active theme from the public
// /api/theme endpoint (the same one the storefront uses), then look it up in
// the registry.
//
// /api/theme now returns `activeThemeConfig` — the on-disk config of the
// active theme — so installed themes resolve their layouts here WITHOUT a web
// rebuild (the static registry is the fallback for bundled themes when the
// config is absent, e.g. an older API).
//
// Safe to call from server components only (uses serverFetch).
// ---------------------------------------------------------------------------
import { serverFetch } from '@/lib/serverFetch';
import { getTheme } from '@/lib/themeRegistry';
import type { PageKey, PageLayout } from './types';

interface ThemeApiConfig {
  layouts?: Record<string, unknown>;
}

function hasBlocks(layout: unknown): layout is PageLayout {
  const l = layout as PageLayout | undefined;
  return !!l && Array.isArray(l.blocks) && l.blocks.length > 0;
}

/** Resolve the active theme's layout for a page, or undefined if none. */
export async function getServerPageLayout(page: PageKey): Promise<PageLayout | undefined> {
  try {
    const res = await serverFetch('/theme', { cache: 'no-store' });
    if (!res.ok) return undefined;
    const body = await res.json();
    const activeTheme = body?.data?.activeTheme as string | null | undefined;
    if (!activeTheme) return undefined;
    const activeThemeConfig = body?.data?.activeThemeConfig as ThemeApiConfig | null | undefined;
    // Disk config first (installed themes + Studio edits to bundled
    // themes), static registry as fallback.
    const layout = (activeThemeConfig?.layouts?.[page] ?? getTheme(activeTheme)?.layouts?.[page]) as
      | PageLayout
      | undefined;
    if (hasBlocks(layout)) return layout;
    return undefined;
  } catch {
    return undefined;
  }
}
