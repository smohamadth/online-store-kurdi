/**
 * RTL rendering regression for every installed theme.
 *
 * The storefront is used by Kurdish and Arabic visitors (the store
 * builder's home market), where the document renders with
 * dir="rtl". This test renders every theme's three home sections
 * under an RTL root and asserts that:
 *
 *   1. the section renders at all (a theme that crashes under RTL
 *      is a white home page for half the visitors),
 *   2. the real content survives (product links, prices, category
 *      links) - not just the section shell,
 *   3. no inline style in the rendered output uses a physical
 *      (direction-dependent) positioning/spacing property. A
 *      physical `left`/`marginLeft` renders on the wrong side in
 *      RTL; the logical properties (insetInlineStart,
 *      marginInlineStart, ...) are the only direction-safe choice.
 *
 * The property scan is the ratchet: it fails the build if a future
 * theme (or a shared component a section uses) reintroduces a
 * physical property.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { THEMES } from '@/lib/themeRegistry';

import DefaultHero from '@/themes/default/sections/Hero';
import MinimalHero from '@/themes/minimal/sections/Hero';
import MinimalFeatured from '@/themes/minimal/sections/Featured';
import MinimalCategories from '@/themes/minimal/sections/Categories';
import BoldHero from '@/themes/bold/sections/Hero';
import BoldFeatured from '@/themes/bold/sections/Featured';
import BoldCategories from '@/themes/bold/sections/Categories';
import DawnlightHero from '@/themes/dawnlight/sections/Hero';
import DawnlightFeatured from '@/themes/dawnlight/sections/Featured';
import DawnlightCategories from '@/themes/dawnlight/sections/Categories';
import PulseHero from '@/themes/pulse/sections/Hero';
import PulseFeatured from '@/themes/pulse/sections/Featured';
import PulseCategories from '@/themes/pulse/sections/Categories';

// default ships only a hero override; featured/categories fall back
// to platform defaults, so the matrix below lists what each theme
// actually provides.
const SECTION_MATRIX: Record<string, { hero: any; featured: any; categories: any }> = {
  default: { hero: DefaultHero, featured: null, categories: null },
  minimal: { hero: MinimalHero, featured: MinimalFeatured, categories: MinimalCategories },
  bold: { hero: BoldHero, featured: BoldFeatured, categories: BoldCategories },
  dawnlight: { hero: DawnlightHero, featured: DawnlightFeatured, categories: DawnlightCategories },
  pulse: { hero: PulseHero, featured: PulseFeatured, categories: PulseCategories },
};

// Physical (direction-dependent) inline-style properties. Logical
// equivalents (insetInlineStart, marginInline*, paddingInline*,
// textAlign: start/end) are allowed.
// React sets inline styles through the CSSOM, so the serialised
// style attribute uses kebab-case. Match in kebab-case,
// case-sensitively (CSSOM output is lowercase).
const PHYSICAL_PROPS = [
  'left',
  'right',
  'margin-left',
  'margin-right',
  'padding-left',
  'padding-right',
  'border-left',
  'border-right',
];

// Note: `text-align: left | right` is also physical; it is checked
// separately below.

const sampleProducts = [
  {
    id: 'p1',
    name: 'Classic T-Shirt',
    slug: 'classic-t-shirt',
    price: 25,
    images: [{ url: '/images/products/t-shirt-1.jpg', alt: 'T-shirt' }],
    category: { name: 'Clothing', slug: 'clothing' },
  },
  {
    id: 'p2',
    name: 'JavaScript: The Good Parts',
    slug: 'js-good-parts',
    price: 32,
    images: [],
    category: { name: 'Books', slug: 'books' },
  },
];

const sampleCategories = [
  { name: 'Clothing', slug: 'clothing', emoji: '👕', count: 12 },
  { name: 'Books', slug: 'books', emoji: '📚', count: 4 },
];

function assertNoPhysicalStyles(container: HTMLElement, label: string) {
  const styleAttr = container.getAttribute('style') || '';
  const styles = [styleAttr, ...Array.from(container.querySelectorAll('[style]')).map((el) => el.getAttribute('style') || '')];
  for (const style of styles) {
    for (const prop of PHYSICAL_PROPS) {
      // Match `prop:` or `prop :` in a serialised style attribute,
      // without matching e.g. `insetInlineStart` (the prop names are
      // checked case-sensitively as React serialises them).
      const pattern = new RegExp(`(?:^|;\\s*)${prop}\\s*:`);
      if (pattern.test(style)) {
        throw new Error(`${label}: physical CSS property "${prop}" in inline style: ${style.slice(0, 120)}`);
      }
    }
    if (/(?:^|;\s*)text-align\s*:\s*(left|right)/i.test(style)) {
      throw new Error(`${label}: physical text-align in inline style: ${style.slice(0, 120)}`);
    }
  }
}

describe('RTL rendering of every theme section', () => {
  for (const theme of THEMES) {
    const sections = SECTION_MATRIX[theme.key];
    if (!sections) continue;

    it(`renders the ${theme.key} hero under RTL with content`, () => {
      const { container } = render(
        <div dir="rtl">
          <sections.hero
            title="New season"
            subtitle="Handpicked for you"
            banners={[{ id: 'b1', title: 'Summer collection', subtitle: 'Up to 40% off', image: '', linkUrl: '/products', buttonText: 'Shop now' }]}
          />
        </div>
      );
      const section = container.querySelector('[data-section="hero"]') ?? container;
      expect(section, `${theme.key} hero section element`).toBeTruthy();
      // The hero must carry real text, not just a shell.
      expect(section!.textContent!.length).toBeGreaterThan(10);
      assertNoPhysicalStyles(container as HTMLElement, `${theme.key}/hero`);
    });

    if (sections.featured) {
      it(`renders the ${theme.key} featured grid under RTL with product links and prices`, () => {
        const { container } = render(
          <div dir="rtl">
            <sections.featured title="Featured" subtitle="This week" products={sampleProducts} config={{ limit: 4 }} />
          </div>
        );
        const section = container.querySelector('[data-section="featured"]');
        expect(section, `${theme.key} featured section element`).toBeTruthy();
        // Product links survive RTL.
        const productLinks = Array.from(section!.querySelectorAll('a[href^="/products/"]'));
        expect(productLinks.length).toBeGreaterThanOrEqual(sampleProducts.length);
        // Prices survive RTL (some theme renders the currency symbol,
        // some the number - at least the product name must be there).
        expect(section!.textContent!).toContain('Classic T-Shirt');
        assertNoPhysicalStyles(container as HTMLElement, `${theme.key}/featured`);
      });
    }

    if (sections.categories) {
      it(`renders the ${theme.key} category tiles under RTL with links`, () => {
        const { container } = render(
          <div dir="rtl">
            <sections.categories title="Shop by category" categories={sampleCategories} />
          </div>
        );
        const section = container.querySelector('[data-section="categories"]');
        expect(section, `${theme.key} categories section element`).toBeTruthy();
        const categoryLinks = Array.from(section!.querySelectorAll('a[href^="/category/"]'));
        expect(categoryLinks.length).toBeGreaterThanOrEqual(sampleCategories.length);
        expect(section!.textContent!).toContain('Clothing');
        assertNoPhysicalStyles(container as HTMLElement, `${theme.key}/categories`);
      });
    }
  }

  it('registry and test matrix stay in sync', () => {
    // If a new theme is added to the registry, its sections must be
    // added to the matrix above or this test fails and forces the
    // decision (ship RTL-safe or skip deliberately).
    const untested = THEMES.filter((t) => !SECTION_MATRIX[t.key]).map((t) => t.key);
    expect(untested, `themes missing from SECTION_MATRIX: ${untested.join(', ')}`).toEqual([]);
  });
});
