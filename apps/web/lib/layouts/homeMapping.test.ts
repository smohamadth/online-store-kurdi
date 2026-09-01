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
import { BLOCK_TO_SECTION, blockToHomeSection } from './homeMapping';
import type { BlockType, LayoutBlock } from './types';

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
    const types: BlockType[] = [
      'hero', 'promo', 'bannerStrip', 'trustBar', 'features', 'categories',
      'featured', 'newArrivals', 'trending', 'dealCountdown', 'testimonials',
      'stats', 'gallery', 'richText', 'custom', 'newsletter',
    ];
    for (const t of types) expect(BLOCK_TO_SECTION[t]).toBeTruthy();
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

  it('derives sortOrder from grid position (row-major, then column)', () => {
    const a = blockToHomeSection(block({ id: 'a', rowStart: 1, colStart: 1 }));
    const b = blockToHomeSection(block({ id: 'b', rowStart: 1, colStart: 2 }));
    const c = blockToHomeSection(block({ id: 'c', rowStart: 2, colStart: 1 }));
    expect(a.sortOrder).toBeLessThan(b.sortOrder);
    expect(b.sortOrder).toBeLessThan(c.sortOrder);
  });
});
