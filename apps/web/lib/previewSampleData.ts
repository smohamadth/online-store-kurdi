/**
 * Sample data for the theme preview.
 *
 * The /preview/<key> page is a merchant-facing surface that
 * demos what a theme looks like with realistic content. Real
 * merchant data is intentionally not used because:
 *
 *   1. New merchants on a fresh install have no products. A
 *      blank gallery doesn't demo a theme.
 *   2. The preview needs to look consistent across stores so
 *      a screenshot of one merchant's preview is comparable
 *      to a screenshot of another merchant's preview of the
 *      same theme.
 *   3. Themes ship with their own opinion about imagery (the
 *      Bold theme needs loud visuals; the Minimal theme
 *      needs quiet ones). Real merchant images are out of
 *      the theme author's control.
 *
 * The fixture is intentionally small (4 products, 4
 * categories) — enough to fill a grid without padding the
 * page with placeholder content. The product images are
 * plain coloured blocks (CSS gradients) so the demo doesn't
 * depend on a CDN being reachable.
 *
 * If a future phase adds paid themes with their own bundled
 * sample data, this module becomes the registry of "shipped
 * with the platform" fixtures; themes can also ship their own.
 */

export interface PreviewProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  category: { name: string; slug: string };
  /**
   * The colour shown when the product card renders without
   * an image. The preview uses a CSS gradient based on this
   * colour so the demo always looks finished.
   */
  accent: string;
  imageAlt: string;
}

export interface PreviewCategory {
  name: string;
  slug: string;
  count: number;
  /**
   * The colour shown in the category card's gradient when
   * no image is provided.
   */
  accent: string;
}

export const PREVIEW_PRODUCTS: readonly PreviewProduct[] = [
  {
    id: 'sample-1',
    name: 'Aero Headphones',
    slug: 'aero-headphones',
    price: 199.0,
    category: { name: 'Electronics', slug: 'electronics' },
    accent: '#2563eb',
    imageAlt: 'Wireless over-ear headphones in matte black',
  },
  {
    id: 'sample-2',
    name: 'Field Notebook',
    slug: 'field-notebook',
    price: 28.0,
    category: { name: 'Stationery', slug: 'stationery' },
    accent: '#8b6f47',
    imageAlt: 'Leather-bound notebook on a wooden desk',
  },
  {
    id: 'sample-3',
    name: 'Linen Throw',
    slug: 'linen-throw',
    price: 145.0,
    category: { name: 'Home', slug: 'home' },
    accent: '#a89580',
    imageAlt: 'Folded linen throw blanket in natural beige',
  },
  {
    id: 'sample-4',
    name: 'Ceramic Mug',
    slug: 'ceramic-mug',
    price: 32.0,
    category: { name: 'Home', slug: 'home' },
    accent: '#d6c5a8',
    imageAlt: 'Hand-thrown ceramic mug in speckled clay',
  },
] as const;

export const PREVIEW_CATEGORIES: readonly PreviewCategory[] = [
  { name: 'Electronics', slug: 'electronics', count: 24, accent: '#2563eb' },
  { name: 'Stationery', slug: 'stationery', count: 18, accent: '#8b6f47' },
  { name: 'Home', slug: 'home', count: 42, accent: '#a89580' },
  { name: 'Apparel', slug: 'apparel', count: 36, accent: '#dc2626' },
] as const;

/**
 * The store name and description used in the preview hero.
 * The platform's real store settings aren't used because
 * the preview needs to look the same on every install.
 */
export const PREVIEW_STORE = {
  name: 'The Sample Store',
  description:
    'A small collection of things, made carefully. This is the demo content used in the theme preview.',
} as const;
