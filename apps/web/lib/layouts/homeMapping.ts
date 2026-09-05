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
  cta: 'cta',
  video: 'video',
  image: 'lookbook',
  textImage: 'lookbook',
  divider: 'custom',
  faq: 'faq',
  steps: 'steps',
  logoStrip: 'logos',
  pricing: 'pricing',
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

function firstString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.length) return v;
  }
  return undefined;
}

/**
 * One item/config schema for Theme Studio + Home builder.
 * Home: testimonials `{ name, text }`, quote `quote`, gallery `image`, video `url`.
 * Studio renderer historically used `author` / `text` / `src`. Fill both aliases.
 */
export function normalizeStudioConfig(type: BlockType, cfg: Record<string, unknown>): Record<string, unknown> {
  const next = { ...cfg };
  if (type === 'quote') {
    const body = firstString(next.quote, next.text);
    if (body != null) {
      next.quote = next.quote ?? body;
      next.text = next.text ?? body;
    }
  }
  if (type === 'video') {
    const src = firstString(next.url, next.src);
    if (src != null) {
      next.url = next.url ?? src;
      next.src = next.src ?? src;
    }
  }
  if (type === 'image' || type === 'textImage') {
    const img = firstString(next.image, next.src, next.url);
    if (img != null) {
      next.image = next.image ?? img;
      next.src = next.src ?? img;
    }
  }
  if (type === 'testimonials' && Array.isArray(next.items)) {
    next.items = next.items.map((it) => {
      const row = asRecord(it);
      const who = firstString(row.name, row.author);
      return { ...row, name: row.name ?? who, author: row.author ?? who };
    });
  }
  if (type === 'logoStrip' && Array.isArray(next.items)) {
    next.items = next.items.map((it) => {
      const row = asRecord(it);
      const name = firstString(row.name, row.text);
      return { ...row, name: row.name ?? name };
    });
  }
  if (type === 'gallery' && Array.isArray(next.items)) {
    next.items = next.items.map((it) => {
      const row = asRecord(it);
      const img = firstString(row.image, row.src, row.url);
      return { ...row, image: row.image ?? img, src: row.src ?? img, url: row.url ?? img };
    });
  }
  return next;
}

/** Convert a layout block into the HomeSection shape `renderSection` expects. */
export function layoutToHomeSections(layout: PageLayout | null | undefined): HomeSection[] {
  const blocks = layout?.blocks;
  if (!Array.isArray(blocks) || !blocks.length) return [];
  return [...blocks]
    .sort((a, b) => a.rowStart - b.rowStart || a.colStart - b.colStart)
    .map(blockToHomeSection);
}

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
