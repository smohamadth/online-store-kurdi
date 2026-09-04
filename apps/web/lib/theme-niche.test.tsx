/**
 * Each bundled theme must keep a unique niche and stamp it on its
 * home sections. The picker sells five different storefronts; this
 * ratchet fails if two themes share a niche or if a section forgets
 * the data-niche marker after a copy-paste.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { THEMES } from '@/lib/themeRegistry';

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

const SECTIONS: Record<string, { hero: any; featured: any; categories: any }> = {
  minimal: { hero: MinimalHero, featured: MinimalFeatured, categories: MinimalCategories },
  bold: { hero: BoldHero, featured: BoldFeatured, categories: BoldCategories },
  dawnlight: { hero: DawnlightHero, featured: DawnlightFeatured, categories: DawnlightCategories },
  pulse: { hero: PulseHero, featured: PulseFeatured, categories: PulseCategories },
};

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
const categories = [{ name: 'Clothing', slug: 'clothing', emoji: '👕', count: 12 }];
const banners = [
  { id: 'b1', title: 'Summer collection', subtitle: 'Quiet goods', image: '', linkUrl: '/products', buttonText: 'Shop now' },
];

describe('bundled themes have unique niches', () => {
  it('every theme.json declares a niche', () => {
    for (const t of THEMES) {
      expect(t.niche, `${t.key} missing niche`).toBeTruthy();
    }
  });

  it('no two themes share a niche label', () => {
    const niches = THEMES.map((t) => t.niche);
    expect(new Set(niches).size, niches.join(', ')).toBe(THEMES.length);
  });
});

describe('sections stamp data-niche from theme.json', () => {
  for (const t of THEMES) {
    const S = SECTIONS[t.key];
    if (!S) continue;

    it(`${t.key} hero/featured/categories carry niche "${t.niche}"`, () => {
      const hero = render(<S.hero banners={banners} />).container.querySelector('[data-section="hero"]');
      const featured = render(
        <S.featured title="Featured" products={products} config={{ limit: 4 }} />,
      ).container.querySelector('[data-section="featured"]');
      const cats = render(
        <S.categories title="Shop" categories={categories} />,
      ).container.querySelector('[data-section="categories"]');

      expect(hero?.getAttribute('data-niche')).toBe(t.niche);
      expect(featured?.getAttribute('data-niche')).toBe(t.niche);
      expect(cats?.getAttribute('data-niche')).toBe(t.niche);
    });
  }
});

describe('niche-specific hero signatures', () => {
  it('minimal is text-first: editorial rule, no hero <img>', () => {
    const { container } = render(<MinimalHero banners={banners} />);
    expect(container.querySelector('[data-editorial-rule]')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });

  it('bold is a fashion drop: ticker + uppercase headline', () => {
    const { container } = render(<BoldHero banners={banners} />);
    expect(container.querySelector('[data-drop-ticker]')).toBeTruthy();
    const h1 = container.querySelector('h1') as HTMLElement;
    expect(h1.style.textTransform).toBe('uppercase');
  });

  it('dawnlight is home goods: olive start-edge on the paper panel', () => {
    const { container } = render(<DawnlightHero banners={banners} />);
    const panel = Array.from(container.querySelectorAll<HTMLElement>('[style]')).find((el) =>
      (el.getAttribute('style') || '').includes('border-inline-start'),
    );
    expect(panel, 'expected a paper panel with border-inline-start').toBeTruthy();
  });

  it('pulse is DTC: last headline word is accent-coloured', () => {
    const { container } = render(<PulseHero banners={banners} />);
    const word = container.querySelector('[data-accent-word]');
    expect(word).toBeTruthy();
    expect(word!.textContent).toBe('collection');
  });

  it('minimal categories use a numbered table of contents', () => {
    const { container } = render(<MinimalCategories title="Index" categories={categories} />);
    expect(container.querySelector('[data-index]')?.textContent).toBe('01');
  });
});
