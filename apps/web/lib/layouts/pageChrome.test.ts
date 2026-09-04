import { describe, it, expect } from 'vitest';
import { PAGE_CHROME_BLOCKS, studioLayoutReplacesChrome } from './pageChrome';
import type { PageLayout } from './types';

function layout(...types: PageLayout['blocks'][number]['type'][]): PageLayout {
  return {
    columns: 12,
    gap: 24,
    blocks: types.map((type, i) => ({
      id: String(i),
      type,
      colStart: 1,
      colSpan: 12,
      rowStart: i + 1,
      rowSpan: 1,
      config: {},
    })),
  };
}

describe('studioLayoutReplacesChrome', () => {
  it('keeps native products chrome when the layout is only a hero', () => {
    expect(studioLayoutReplacesChrome(layout('hero'), PAGE_CHROME_BLOCKS.products)).toBe(false);
    expect(studioLayoutReplacesChrome(layout('featured', 'newArrivals'), PAGE_CHROME_BLOCKS.products)).toBe(false);
  });

  it('replaces products chrome only when productList is present', () => {
    expect(studioLayoutReplacesChrome(layout('hero', 'productList'), PAGE_CHROME_BLOCKS.products)).toBe(true);
  });

  it('replaces a category page when categoryGrid or productList is present', () => {
    expect(studioLayoutReplacesChrome(layout('hero'), PAGE_CHROME_BLOCKS.category)).toBe(false);
    expect(studioLayoutReplacesChrome(layout('categoryGrid'), PAGE_CHROME_BLOCKS.category)).toBe(true);
  });

  it('replaces a PDP only when productDetail is present', () => {
    expect(studioLayoutReplacesChrome(layout('hero'), PAGE_CHROME_BLOCKS.product)).toBe(false);
    expect(studioLayoutReplacesChrome(layout('productDetail'), PAGE_CHROME_BLOCKS.product)).toBe(true);
  });

  it('is false for empty layouts', () => {
    expect(studioLayoutReplacesChrome(undefined, PAGE_CHROME_BLOCKS.products)).toBe(false);
    expect(studioLayoutReplacesChrome({ columns: 12, gap: 24, blocks: [] }, PAGE_CHROME_BLOCKS.products)).toBe(false);
  });
});
