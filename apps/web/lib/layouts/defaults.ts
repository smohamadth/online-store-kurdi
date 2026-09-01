import {
  PageLayout,
  PageKey,
  LayoutBlock,
  BlockType,
  DEFAULT_COLUMNS,
  DEFAULT_GAP,
} from './types';

/**
 * Default layouts for each storefront page. These mirror the current
 * hand-built layout so a store with no custom theme keeps its exact look, and
 * they give the theme builder a sane starting point to drag blocks around.
 *
 * A page with no entry (undefined) means "render the platform's built-in
 * layout" — so the theme builder does not need to recreate every page to be
 * useful; it only adds an entry when the admin starts editing that page.
 */

/** Build a block placed at row `rowStart`, spanning full width, on 12 cols. */
function fullRow(
  id: string,
  type: BlockType,
  rowStart: number,
  config: Record<string, unknown> = {},
): LayoutBlock {
  return {
    id,
    type,
    colStart: 1,
    colSpan: DEFAULT_COLUMNS,
    rowStart,
    rowSpan: 1,
    config,
  };
}

export const DEFAULT_HOME_LAYOUT: PageLayout = {
  columns: DEFAULT_COLUMNS,
  gap: DEFAULT_GAP,
  blocks: [
    fullRow('hero', 'hero', 1, { title: 'Welcome', subtitle: 'Discover something new' }),
    fullRow('promo', 'promo', 2, { title: 'Promotions' }),
    fullRow('categories', 'categories', 3, { title: 'Shop by Category', subtitle: 'Browse' }),
    fullRow('featured', 'featured', 4, { title: 'Featured Products', subtitle: 'Popular' }),
    fullRow('newArrivals', 'newArrivals', 5, { title: 'New Arrivals' }),
    fullRow('newsletter', 'newsletter', 6, {}),
  ],
};

/** Product listing / category share a common layout shape. */
export const DEFAULT_LISTING_LAYOUT: PageLayout = {
  columns: DEFAULT_COLUMNS,
  gap: DEFAULT_GAP,
  blocks: [
    fullRow('breadcrumb', 'richText', 1, { text: '<!-- breadcrumbs -->' }),
    fullRow('toolbar', 'richText', 2, { text: '<!-- filters / sort -->' }),
    fullRow('grid', 'productList', 3, { title: 'Products' }),
  ],
};

export const DEFAULT_PRODUCT_LAYOUT: PageLayout = {
  columns: DEFAULT_COLUMNS,
  gap: DEFAULT_GAP,
  blocks: [
    // Left: images (col 1-6). Right: buy box (col 7-12).
    { id: 'detail', type: 'productDetail', colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 1, config: {} },
    fullRow('reviews', 'testimonials', 2, { title: 'Reviews' }),
    fullRow('related', 'featured', 3, { title: 'Related Products' }),
  ],
};

export const DEFAULT_BLOG_LAYOUT: PageLayout = {
  columns: DEFAULT_COLUMNS,
  gap: DEFAULT_GAP,
  blocks: [
    fullRow('hero', 'richText', 1, { text: '<!-- blog intro -->' }),
    fullRow('list', 'blogList', 2, { title: 'Latest posts' }),
  ],
};

export const DEFAULT_BLOG_POST_LAYOUT: PageLayout = {
  columns: DEFAULT_COLUMNS,
  gap: DEFAULT_GAP,
  blocks: [
    fullRow('body', 'blogPostBody', 1, {}),
  ],
};

export const DEFAULT_PAGE_LAYOUT: PageLayout = {
  columns: DEFAULT_COLUMNS,
  gap: DEFAULT_GAP,
  blocks: [fullRow('content', 'pageContent', 1, {})],
};

/** The default layout for a page key, or undefined if the page has none. */
export function defaultLayoutFor(page: PageKey): PageLayout | undefined {
  switch (page) {
    case 'home':
      return DEFAULT_HOME_LAYOUT;
    case 'products':
    case 'category':
      return DEFAULT_LISTING_LAYOUT;
    case 'product':
      return DEFAULT_PRODUCT_LAYOUT;
    case 'blog':
      return DEFAULT_BLOG_LAYOUT;
    case 'blogPost':
      return DEFAULT_BLOG_POST_LAYOUT;
    case 'page':
      return DEFAULT_PAGE_LAYOUT;
    default:
      return undefined;
  }
}

/** A fresh layout an admin gets when they start building a page from scratch. */
export function emptyLayout(columns = DEFAULT_COLUMNS): PageLayout {
  return { columns, gap: DEFAULT_GAP, blocks: [] };
}
