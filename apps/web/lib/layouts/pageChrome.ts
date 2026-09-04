/**
 * Whether a Theme Studio layout may replace a storefront page's built-in UI.
 *
 * A products layout that is only a hero (or featured/new/trending) used to
 * hide filters, pagination and the real product grid. Replacement is allowed
 * only when the layout includes a page-native chrome block.
 */
import type { BlockType, PageKey, PageLayout } from './types';

export const PAGE_CHROME_BLOCKS: Record<PageKey, readonly BlockType[]> = {
  home: [],
  products: ['productList'],
  category: ['productList', 'categoryGrid'],
  product: ['productDetail'],
  blog: ['blogList'],
  blogPost: ['blogPostBody', 'pageContent'],
  page: ['pageContent'],
};

export function studioLayoutReplacesChrome(
  layout: PageLayout | null | undefined,
  required: readonly BlockType[],
): boolean {
  if (!layout || !Array.isArray(layout.blocks) || layout.blocks.length === 0) return false;
  if (required.length === 0) return true;
  return layout.blocks.some((b) => required.includes(b.type));
}
