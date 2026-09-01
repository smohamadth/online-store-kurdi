/**
 * Featured section behaviour across the prebuilt themes.
 *
 * Every non-default theme ships its own Featured section. This test
 * pins the behaviour contract they all now share:
 *
 *   1. The grid honours the theme's `productsPerRow` token (via the
 *      `minmax(min(100%, <floor>)px, 1fr)` pattern) instead of a
 *      hard-coded column width. Under the default theme context
 *      `productsPerRow === 4`, so the column floor is
 *      floor(container / 4) for each theme's container.
 *   2. When a product has a `compareAtPrice` above its `price`, the
 *      section shows a strikethrough compare-at price.
 *   3. When a product has an `averageRating`, the section renders a
 *      star-rating line with the numeric score and review count.
 *
 * The sections render without a theme/settings provider, so `useTheme`
 * returns the context default (`DEFAULT_THEME`, productsPerRow = 4) and
 * `useStoreSettings` returns `DEFAULT_SETTINGS` (currency "$").
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import PulseFeatured from '@/themes/pulse/sections/Featured';
import MinimalFeatured from '@/themes/minimal/sections/Featured';
import BoldFeatured from '@/themes/bold/sections/Featured';
import DawnlightFeatured from '@/themes/dawnlight/sections/Featured';

// productsPerRow defaults to 4, so the column floor is floor(container/4).
// container: pulse 1200, minimal 960, bold 1400, dawnlight 1200.
const FEATURED = [
  { name: 'pulse', Component: PulseFeatured, floor: Math.floor(1200 / 4) },
  { name: 'minimal', Component: MinimalFeatured, floor: Math.floor(960 / 4) },
  { name: 'bold', Component: BoldFeatured, floor: Math.floor(1400 / 4) },
  { name: 'dawnlight', Component: DawnlightFeatured, floor: Math.floor(1200 / 4) },
];

const products = [
  {
    id: 'p1',
    name: 'Sale Tee',
    slug: 'sale-tee',
    price: 20,
    compareAtPrice: 30,
    averageRating: 4.5,
    reviewCount: 12,
    images: [],
    category: { name: 'Clothing', slug: 'clothing' },
  },
  {
    id: 'p2',
    name: 'Plain Tee',
    slug: 'plain-tee',
    price: 25,
    images: [],
    category: { name: 'Clothing', slug: 'clothing' },
  },
];

describe('theme Featured sections', () => {
  for (const { name, Component, floor } of FEATURED) {
    it(`${name} Featured honours productsPerRow and shows sale + rating`, () => {
      const { container } = render(
        <Component title="Featured" products={products} config={{ limit: 4 }} />
      );
      const section = container.querySelector('[data-section="featured"]');
      expect(section, `${name} featured section element`).toBeTruthy();

      const text = section!.textContent ?? '';
      // 1. productsPerRow-derived grid, not a hard-coded fixed width.
      const grid = Array.from(section!.querySelectorAll<HTMLElement>('[style*="minmax"]'));
      expect(grid.length, `${name} grid should use a minmax column track`).toBeGreaterThan(0);
      expect(grid[0].getAttribute('style')).toContain(`minmax(min(100%, ${floor}px), 1fr)`);

      // 2. Sale: compare-at price struck through + current price visible.
      const struck = Array.from(section!.querySelectorAll('[style*="line-through"]'));
      expect(struck.length, `${name} should strike through the compare-at price`).toBeGreaterThanOrEqual(1);
      expect(text).toContain('$30.00'); // compareAtPrice via formatPrice
      expect(text).toContain('$20.00'); // sale price via formatPrice

      // 3. Rating line with numeric score and review count.
      expect(section!.querySelector('[aria-label="Rated 4.5 out of 5"]')).toBeTruthy();
      expect(text).toContain('4.5');
      expect(text).toContain('(12)');
    });

    it(`${name} Featured falls back to a plain price without sale/rating data`, () => {
      const { container } = render(
        <Component title="Featured" products={[{ id: 'p2', name: 'Plain Tee', slug: 'plain-tee', price: 25, images: [], category: { name: 'Clothing', slug: 'clothing' } }]} config={{ limit: 4 }} />
      );
      const section = container.querySelector('[data-section="featured"]')!;
      expect(section.textContent).toContain('$25.00');
      expect(section.textContent).not.toContain('4.5');
      expect(section.textContent).not.toContain('(12)');
    });
  }
});
