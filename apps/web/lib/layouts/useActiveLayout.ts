'use client';

/**
 * useActiveLayout — resolve the ACTIVE theme's saved layout for a page.
 *
 * Reads `resolveThemeConfig(theme.activeTheme).layouts?.[page]`, where
 * resolveThemeConfig consults the runtime disk-catalog overlay first (so an
 * admin-installed theme — or a bundled theme edited in Theme Studio — takes
 * effect without a rebuild) and the static registry as fallback. Returns
 * undefined when the active theme has no layout for that page, in which case
 * the page should render its built-in layout (unchanged behaviour). This is
 * the single hook every storefront page uses to opt into Theme Studio
 * layouts, keeping the resolution logic in one place.
 */
import { useMemo } from 'react';
import { resolveThemeConfig } from '@/lib/themeRuntime';
import { useTheme } from '@/lib/theme';
import type { PageKey, PageLayout } from './types';

export function useActiveLayout(page: PageKey): PageLayout | undefined {
  const { theme } = useTheme();
  return useMemo(() => {
    const cfg = resolveThemeConfig(theme.activeTheme);
    const layout = cfg?.layouts?.[page] as PageLayout | undefined;
    if (!layout || !Array.isArray(layout.blocks) || layout.blocks.length === 0) return undefined;
    return layout;
  }, [theme.activeTheme, page]);
}
