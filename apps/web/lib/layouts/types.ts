// ---------------------------------------------------------------------------
// Page layout model for the visual theme builder.
//
// A theme can ship per-page layouts. A layout is a CSS grid: the page is a
// fixed-column grid, and each block is placed into it with explicit
// grid coordinates (start / span). This is what gives the admin "control over
// the grid and layout of each page".
//
// Data model:
//   PageLayout {
//     columns   number         grid-template-columns count (e.g. 12)
//     gap       number         gutter between cells (px)
//     blocks    LayoutBlock[]  every block on the page with its grid position
//   }
//   LayoutBlock {
//     id        string   stable id for drag/ordering
//     type      BlockType which storefront component renders it
//     colStart  number   1-based grid column
//     colSpan   number   number of columns it occupies
//     rowStart  number   1-based grid row
//     rowSpan   number   number of rows it occupies
//     config    object   block-specific payload (headline, products count, html…)
//   }
// ---------------------------------------------------------------------------

/** The storefront block types the layout renderer knows how to draw. */
export type BlockType =
  | 'hero'
  | 'promo'
  | 'bannerStrip'
  | 'trustBar'
  | 'features'
  | 'categories'
  | 'featured'
  | 'newArrivals'
  | 'trending'
  | 'dealCountdown'
  | 'testimonials'
  | 'stats'
  | 'gallery'
  | 'richText'
  | 'custom'
  | 'newsletter'
  // Rich, pre-built content blocks: ready-made, configurable sections an admin
  // can drop in and style without writing code.
  | 'cta'
  | 'video'
  | 'image'
  | 'textImage'
  | 'divider'
  | 'faq'
  | 'steps'
  | 'logoStrip'
  | 'pricing'
  | 'quote'
  | 'iconsGrid'
  // Page-native blocks: they render a page's core content, so a theme author
  // can place the real products grid, a product detail, a blog list, etc.
  // inside a layout grid alongside the marketing blocks above.
  | 'productDetail'
  | 'productList'
  | 'categoryGrid'
  | 'blogList'
  | 'blogPostBody'
  | 'pageContent';

/** Every block type the platform can render. */
export const BLOCK_TYPES: readonly BlockType[] = [
  'hero',
  'promo',
  'bannerStrip',
  'trustBar',
  'features',
  'categories',
  'featured',
  'newArrivals',
  'trending',
  'dealCountdown',
  'testimonials',
  'stats',
  'gallery',
  'richText',
  'custom',
  'newsletter',
  'cta',
  'video',
  'image',
  'textImage',
  'divider',
  'faq',
  'steps',
  'logoStrip',
  'pricing',
  'quote',
  'iconsGrid',
  'productDetail',
  'productList',
  'categoryGrid',
  'blogList',
  'blogPostBody',
  'pageContent',
];

export interface LayoutBlock {
  id: string;
  type: BlockType;
  colStart: number;
  colSpan: number;
  rowStart: number;
  rowSpan: number;
  config: Record<string, unknown>;
}

export interface PageLayout {
  /** How many columns the page grid uses. */
  columns: number;
  /** Gutter between cells in px. */
  gap: number;
  /** Blocks, each placed on the grid. */
  blocks: LayoutBlock[];
}

/**
 * The full set of storefront pages a theme can lay out. Keys are stable
 * identifiers the renderer and the admin page use to pick which page they are
 * editing/rendering.
 */
export type PageKey =
  | 'home'
  | 'products'
  | 'category'
  | 'product'
  | 'blog'
  | 'blogPost'
  | 'page';

export const PAGE_KEYS: readonly PageKey[] = [
  'home',
  'products',
  'category',
  'product',
  'blog',
  'blogPost',
  'page',
];

/** Human labels for the page picker in the theme studio. */
export const PAGE_LABELS: Record<PageKey, string> = {
  home: 'Home',
  products: 'All products',
  category: 'Category',
  product: 'Product detail',
  blog: 'Blog',
  blogPost: 'Blog post',
  page: 'Custom page',
};

export const DEFAULT_COLUMNS = 12;
export const DEFAULT_GAP = 24;

/** Chrome-only types that belong on listing/PDP/blog pages, not the home canvas. */
export const PAGE_CHROME_BLOCKS: readonly BlockType[] = [
  'productDetail',
  'productList',
  'categoryGrid',
  'blogList',
  'blogPostBody',
  'pageContent',
];

export function paletteForPage(page: PageKey): readonly BlockType[] {
  const marketing = BLOCK_TYPES.filter((t) => !PAGE_CHROME_BLOCKS.includes(t));
  switch (page) {
    case 'home':
      return marketing;
    case 'products':
    case 'category':
      return [...marketing, 'productList', 'categoryGrid'];
    case 'product':
      return [...marketing, 'productDetail'];
    case 'blog':
      return [...marketing, 'blogList'];
    case 'blogPost':
      return [...marketing, 'blogPostBody'];
    case 'page':
      return [...marketing, 'pageContent'];
    default:
      return BLOCK_TYPES;
  }
}
