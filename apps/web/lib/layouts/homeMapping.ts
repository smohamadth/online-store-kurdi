/**
 * homeMapping — convert Theme Studio layout blocks into HomeSection rows.
 *
 * The storefront home page is data-driven through `HomeSection` rows
 * (Appearance → Home). A Theme Studio layout block carries the same intent
 * plus an explicit grid position. This module is the single bridge between the
 * two so the storefront can render a saved `layouts.home` by reusing the exact
 * same rich section renderers the default layout uses.
 *
 * Pure and side-effect free so it is trivially unit-testable.
 */
import type { LayoutBlock, BlockType } from './types';
import type { HomeSection } from '@/lib/homeSections';

/** Map a layout block type to the HomeSection `type` its renderer expects. */
export const BLOCK_TO_SECTION: Partial<Record<BlockType, HomeSection['type']>> = {
  hero: 'hero',
  promo: 'promo',
  bannerStrip: 'bannerStrip',
  trustBar: 'trustBar',
  features: 'features',
  categories: 'categories',
  featured: 'featured',
  newArrivals: 'carouselNew',
  trending: 'carouselTrending',
  dealCountdown: 'dealCountdown',
  testimonials: 'testimonials',
  stats: 'stats',
  gallery: 'gallery',
  richText: 'richText',
  custom: 'custom',
  newsletter: 'newsletter',
};

/** Convert a layout block into the HomeSection shape `renderSection` expects. */
export function blockToHomeSection(b: LayoutBlock): HomeSection {
  const cfg = b.config || {};
  return {
    id: b.id,
    key: b.type,
    type: BLOCK_TO_SECTION[b.type] ?? 'custom',
    title: (cfg.title as string | null) ?? null,
    subtitle: (cfg.subtitle as string | null) ?? null,
    isVisible: true,
    sortOrder: b.rowStart * 100 + b.colStart,
    config: cfg,
  };
}
