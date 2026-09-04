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
import type { LayoutBlock, BlockType, PageLayout } from './types';
import type { HomeSection } from '@/lib/homeSections';

/**
 * Live storefront home is always Appearance → Home (`HomeSection` rows).
 * Theme Studio `layouts.home` is a canvas for custom themes and must not
 * hide those rows (that made the Home builder look saved but never render).
 */
export function pickStorefrontHomeSections(
  dbSections: HomeSection[],
  _studioHome?: PageLayout | null,
): HomeSection[] {
  return dbSections;
}

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
  cta: 'custom',
  video: 'video',
  image: 'lookbook',
  textImage: 'lookbook',
  divider: 'custom',
  faq: 'faq',
  steps: 'features',
  logoStrip: 'logos',
  pricing: 'custom',
  quote: 'quote',
  iconsGrid: 'features',
  productDetail: 'custom',
  productList: 'featured',
  categoryGrid: 'categories',
  blogList: 'custom',
  blogPostBody: 'richText',
  pageContent: 'custom',
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Align studio config keys with HomeView renderers (quote.text, video.src, …). */
export function normalizeStudioConfig(type: BlockType, cfg: Record<string, unknown>): Record<string, unknown> {
  const next = { ...cfg };
  if (type === 'quote' && next.quote == null && next.text != null) next.quote = next.text;
  if (type === 'video' && next.url == null && next.src != null) next.url = next.src;
  if ((type === 'image' || type === 'textImage') && next.image == null) {
    next.image = next.src ?? next.url;
  }
  if (type === 'testimonials' && Array.isArray(next.items)) {
    next.items = next.items.map((it) => {
      const row = asRecord(it);
      return { ...row, name: row.name ?? row.author };
    });
  }
  if (type === 'gallery' && Array.isArray(next.items)) {
    next.items = next.items.map((it) => {
      const row = asRecord(it);
      return { ...row, image: row.image ?? row.src ?? row.url };
    });
  }
  return next;
}

/** Convert a layout block into the HomeSection shape `renderSection` expects. */
export function blockToHomeSection(b: LayoutBlock): HomeSection {
  const cfg = normalizeStudioConfig(b.type, b.config || {});
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
