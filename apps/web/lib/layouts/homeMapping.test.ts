/**
 * homeMapping.ts — Theme Studio layout block → HomeSection bridge.
 *
 * This is the seam that lets the storefront home page render a saved
 * `layouts.home` through the exact same rich renderers the default layout
 * uses. Pinning it keeps the two data models in sync:
 *   - every block type maps to a renderer the storefront actually has
 *   - block config (title/subtitle) flows into the HomeSection fields
 *   - grid coordinates produce a sensible sortOrder (row-major, then column)
 */
import { describe, it, expect } from 'vitest';
import { BLOCK_TO_SECTION, blockToHomeSection, pickStorefrontHomeSections } from './homeMapping';
import { BLOCK_TYPES, paletteForPage, type BlockType, type LayoutBlock } from './types';
import type { HomeSection } from '@/lib/homeSections';

function block(overrides: Partial<LayoutBlock>): LayoutBlock {
  return {
    id: 'b1',
    type: 'featured',
    colStart: 1,
    colSpan: 6,
    rowStart: 2,
    rowSpan: 1,
    config: {},
    ...overrides,
  };
}

describe('BLOCK_TO_SECTION', () => {
  it('covers every layout block type', () => {
    for (const t of BLOCK_TYPES) expect(BLOCK_TO_SECTION[t]).toBeTruthy();
  });

  it('maps rich studio blocks onto real HomeView section types', () => {
    expect(BLOCK_TO_SECTION.faq).toBe('faq');
    expect(BLOCK_TO_SECTION.video).toBe('video');
    expect(BLOCK_TO_SECTION.quote).toBe('quote');
    expect(BLOCK_TO_SECTION.logoStrip).toBe('logos');
    expect(BLOCK_TO_SECTION.textImage).toBe('lookbook');
    expect(BLOCK_TO_SECTION.cta).toBe('cta');
    expect(BLOCK_TO_SECTION.steps).toBe('steps');
    expect(BLOCK_TO_SECTION.pricing).toBe('pricing');
  });

  it('maps arrivals/trending to their carousel renderers', () => {
    expect(BLOCK_TO_SECTION.newArrivals).toBe('carouselNew');
    expect(BLOCK_TO_SECTION.trending).toBe('carouselTrending');
  });
});

describe('blockToHomeSection', () => {
  it('preserves id, key and config', () => {
    const b = block({ config: { title: 'Top', limit: 4 } });
    const s = blockToHomeSection(b);
    expect(s.id).toBe('b1');
    expect(s.key).toBe('featured');
    expect(s.type).toBe('featured');
    expect(s.config).toEqual({ title: 'Top', limit: 4 });
  });

  it('maps title/subtitle into the section headline fields', () => {
    const b = block({ type: 'hero', config: { title: 'Big Sale', subtitle: 'Up to 50% off' } });
    const s = blockToHomeSection(b);
    expect(s.title).toBe('Big Sale');
    expect(s.subtitle).toBe('Up to 50% off');
  });

  it('always marks the block visible', () => {
    expect(blockToHomeSection(block({})).isVisible).toBe(true);
  });

  it('normalises quote.text and video.src for HomeView', () => {
    const q = blockToHomeSection(block({ type: 'quote', config: { text: 'Hello', author: 'Ada' } }));
    expect(q.type).toBe('quote');
    expect(q.config.quote).toBe('Hello');
    const v = blockToHomeSection(block({ type: 'video', config: { src: 'https://youtu.be/x' } }));
    expect(v.config.url).toBe('https://youtu.be/x');
  });

  it('maps Home-builder testimonial/gallery keys onto studio aliases', () => {
    const t = blockToHomeSection(
      block({ type: 'testimonials', config: { items: [{ name: 'Ali', text: 'Great', role: 'Buyer' }] } }),
    );
    const items = t.config.items as { name: string; author: string; text: string }[];
    expect(items[0].name).toBe('Ali');
    expect(items[0].author).toBe('Ali');
    const g = blockToHomeSection(
      block({ type: 'gallery', config: { items: [{ image: '/g.jpg', caption: 'Look' }] } }),
    );
    const gItems = g.config.items as { image: string; src: string }[];
    expect(gItems[0].image).toBe('/g.jpg');
    expect(gItems[0].src).toBe('/g.jpg');
  });

  it('derives sortOrder from grid position (row-major, then column)', () => {
    const a = blockToHomeSection(block({ id: 'a', rowStart: 1, colStart: 1 }));
    const b = blockToHomeSection(block({ id: 'b', rowStart: 1, colStart: 2 }));
    const c = blockToHomeSection(block({ id: 'c', rowStart: 2, colStart: 1 }));
    expect(a.sortOrder).toBeLessThan(b.sortOrder);
    expect(b.sortOrder).toBeLessThan(c.sortOrder);
  });
});

describe('pickStorefrontHomeSections', () => {
  it('always returns DB HomeSection rows, even when a studio home layout exists', () => {
    const db: HomeSection[] = [
      {
        id: 'h1',
        key: 'hero',
        type: 'hero',
        title: null,
        subtitle: null,
        isVisible: true,
        sortOrder: 10,
        config: {},
      },
    ];
    const studio = {
      columns: 12,
      gap: 24,
      blocks: [block({ id: 'studio-hero', type: 'hero' as BlockType })],
    };
    expect(pickStorefrontHomeSections(db, studio)).toEqual(db);
    expect(pickStorefrontHomeSections(db, null)).toEqual(db);
  });
});

describe('paletteForPage', () => {
  it('hides chrome-only types on the home canvas', async () => {
    const { paletteForPage } = await import('./types');
    expect(paletteForPage('home')).not.toContain('productDetail');
    expect(paletteForPage('home')).not.toContain('blogList');
    expect(paletteForPage('product')).toContain('productDetail');
    expect(paletteForPage('products')).toContain('productList');
  });
});
