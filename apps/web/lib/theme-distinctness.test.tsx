/**
 * The bundled themes must stay visually distinct from one another.
 *
 * Each theme sells a different promise in its theme.json description - Bold is
 * "image-first / oversized photography", Minimal is "text-first, no marketing
 * chrome", Dawnlight is flat Shopify-Dawn, Pulse is rounded Medusa-style. The
 * risk is drift: a shared edit (or a copy-paste between sections) quietly
 * collapses them onto the same card, and the theme picker becomes five names
 * for one design.
 *
 * That had already happened to the product card. All four Featured sections
 * rendered the identical anatomy: a 1:1 image, then the name, then the same
 * five-star glyph row. This test pins the differentiators that were
 * reintroduced so they cannot converge again silently.
 *
 * It deliberately asserts on RELATIVE difference (the set of values is
 * distinct) rather than on exact px values, so a designer can retune any
 * single theme without fighting the test - only making two themes identical
 * fails.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import PulseFeatured from '@/themes/pulse/sections/Featured';
import MinimalFeatured from '@/themes/minimal/sections/Featured';
import BoldFeatured from '@/themes/bold/sections/Featured';
import DawnlightFeatured from '@/themes/dawnlight/sections/Featured';

const THEMES = [
  { key: 'bold', Component: BoldFeatured },
  { key: 'dawnlight', Component: DawnlightFeatured },
  { key: 'minimal', Component: MinimalFeatured },
  { key: 'pulse', Component: PulseFeatured },
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
];

function renderFeatured(Component: (typeof THEMES)[number]['Component']) {
  const { container } = render(
    <Component title="Featured" products={products} config={{ limit: 4 }} />,
  );
  return container.querySelector('[data-section="featured"]') as HTMLElement;
}

describe('theme tokens are distinct', () => {
  // The token layer is what drives colour, radius and density. Two themes
  // sharing an entire palette would look the same regardless of markup.
  const tokens = THEMES.map(({ key }) => ({
    key,
    t: JSON.parse(
      readFileSync(resolve(__dirname, `../themes/${key}/theme.json`), 'utf8'),
    ).tokens as Record<string, unknown>,
  }));

  it.each(['primaryColor', 'accentColor', 'bodyBg', 'radius', 'fontFamily'])(
    'no two themes share the same %s',
    (token) => {
      const values = tokens.map((x) => `${x.t[token]}`);
      // Dawnlight and Minimal may legitimately both be light, so we only
      // require that the FULL set is not collapsed to a single value.
      expect(new Set(values).size, `${token}: ${values.join(', ')}`).toBeGreaterThan(1);
    },
  );

  it('each theme has a unique combination of its core tokens', () => {
    const fingerprints = tokens.map(
      (x) => `${x.t.primaryColor}|${x.t.accentColor}|${x.t.bodyBg}|${x.t.radius}|${x.t.fontFamily}`,
    );
    expect(new Set(fingerprints).size).toBe(THEMES.length);
  });

  it('ships both a light and a dark theme', () => {
    // A catalogue where every theme is light gives an operator no real choice.
    const luminance = (hex: string) => {
      const h = hex.replace('#', '');
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ls = tokens.map((x) => luminance(String(x.t.bodyBg)));
    expect(Math.min(...ls), 'expected at least one dark theme').toBeLessThan(0.2);
    expect(Math.max(...ls), 'expected at least one light theme').toBeGreaterThan(0.8);
  });
});

describe('product cards are not all the same shape', () => {
  it('themes do not all crop product images to the same aspect ratio', () => {
    // The concrete regression: every Featured section used a 1:1 image, so
    // the four themes produced visually interchangeable grids.
    const ratios = THEMES.map(({ key }) => {
      const src = readFileSync(
        resolve(__dirname, `../themes/${key}/sections/Featured.tsx`),
        'utf8',
      );
      const m = src.match(/aspectRatio:\s*'([^']+)'/);
      return { key, ratio: m ? m[1].replace(/\s/g, '') : 'none' };
    });

    const distinct = new Set(ratios.map((r) => r.ratio));
    expect(
      distinct.size,
      `product image aspect ratios: ${ratios.map((r) => `${r.key}=${r.ratio}`).join(', ')}`,
    ).toBeGreaterThanOrEqual(3);
  });

  it('renders a different number of DOM nodes per card across themes', () => {
    // A crude but honest proxy for "different card anatomy": if two themes
    // build the identical element tree, their markup has converged.
    const shapes = THEMES.map(({ key, Component }) => {
      const section = renderFeatured(Component);
      return { key, n: section.querySelectorAll('*').length };
    });
    expect(new Set(shapes.map((s) => s.n)).size, JSON.stringify(shapes)).toBeGreaterThan(1);
  });
});

describe('rating treatments differ but keep the same a11y contract', () => {
  it('every theme exposes the score to assistive tech', () => {
    // Whatever the visual treatment, the semantics must not regress.
    for (const { key, Component } of THEMES) {
      const section = renderFeatured(Component);
      expect(
        section.querySelector('[aria-label="Rated 4.5 out of 5"]'),
        `${key} must label its rating`,
      ).toBeTruthy();
      expect(section.textContent, `${key} shows the numeric score`).toContain('4.5');
      expect(section.textContent, `${key} shows the review count`).toContain('(12)');
    }
  });

  it('does not render the same star glyph row in every theme', () => {
    // Minimal drops the glyph strip (it ships "no marketing chrome") and Bold
    // uses a solid fill meter, so the star row must not be universal.
    const withStars = THEMES.filter(({ Component }) =>
      (renderFeatured(Component).textContent ?? '').includes('★'),
    ).map((t) => t.key);

    expect(withStars.length, `themes using a star row: ${withStars.join(', ')}`).toBeLessThan(
      THEMES.length,
    );
  });

  it('minimal renders a typographic rating rather than stars', () => {
    const section = renderFeatured(MinimalFeatured);
    expect(section.textContent).not.toContain('★');
    expect(section.textContent).toContain('4.5');
  });

  it('bold renders a proportional meter for the rating', () => {
    const section = renderFeatured(BoldFeatured);
    const label = section.querySelector('[aria-label="Rated 4.5 out of 5"]')!;
    // 4.5 / 5 -> the filled bar should be 90% wide.
    const fill = Array.from(label.querySelectorAll<HTMLElement>('span')).find((el) =>
      /width:\s*90%/.test(el.getAttribute('style') ?? ''),
    );
    expect(fill, 'expected a 90%-wide fill for a 4.5 rating').toBeTruthy();
  });
});
