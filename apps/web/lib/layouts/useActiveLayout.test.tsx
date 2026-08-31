/**
 * useActiveLayout — resolves the ACTIVE theme's saved layout for a page.
 *
 * This is the single seam every storefront page uses to opt into a Theme
 * Studio layout, so we pin its behaviour with mocked theme + registry:
 *   - returns the active theme's layout for the requested page
 *   - returns undefined for a page the theme has no layout for
 *   - returns undefined for a layout with no blocks (i.e. "no override")
 *   - is inert when the active theme is unknown to the registry
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useActiveLayout } from './useActiveLayout';

const state = vi.hoisted(() => ({ activeTheme: 'brand' }));

const HOME_LAYOUT = {
  columns: 12,
  gap: 24,
  blocks: [{ id: 'a', type: 'hero', colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 1, config: {} }],
};

vi.mock('@/lib/theme', () => ({
  useTheme: () => ({ theme: { activeTheme: state.activeTheme } }),
}));

vi.mock('@/lib/themeRegistry', () => ({
  getTheme: (key: string | null | undefined) =>
    key === 'brand'
      ? { key: 'brand', layouts: { home: HOME_LAYOUT, products: { columns: 12, gap: 24, blocks: [] } } }
      : { key: 'default', layouts: {} },
}));

describe('useActiveLayout', () => {
  beforeEach(() => {
    state.activeTheme = 'brand';
    vi.clearAllMocks();
  });

  it('returns the active theme layout for the requested page', () => {
    const { result } = renderHook(() => useActiveLayout('home'));
    expect(result.current).toBeDefined();
    expect(result.current!.blocks).toHaveLength(1);
    expect(result.current!.blocks[0].type).toBe('hero');
  });

  it('returns undefined for a page with no saved layout', () => {
    const { result } = renderHook(() => useActiveLayout('blog'));
    expect(result.current).toBeUndefined();
  });

  it('returns undefined for a layout that has no blocks', () => {
    const { result } = renderHook(() => useActiveLayout('products'));
    expect(result.current).toBeUndefined();
  });

  it('is inert when the active theme is unknown to the registry', () => {
    state.activeTheme = 'not-installed';
    const { result } = renderHook(() => useActiveLayout('home'));
    expect(result.current).toBeUndefined();
  });
});
