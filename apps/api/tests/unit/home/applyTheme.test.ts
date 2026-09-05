import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { layoutHomeToSeeds } from '../../../src/modules/home/home.layoutMap';

describe('layoutHomeToSeeds', () => {
  it('maps studio block types onto HomeSection types in row order', () => {
    const seeds = layoutHomeToSeeds({
      columns: 12,
      gap: 24,
      blocks: [
        { id: 'cta', type: 'cta', colStart: 1, rowStart: 2, colSpan: 12, rowSpan: 1, config: { title: 'Go', buttonHref: '/products' } },
        { id: 'hero', type: 'hero', colStart: 1, rowStart: 1, colSpan: 12, rowSpan: 1, config: {} },
        { id: 'new', type: 'newArrivals', colStart: 1, rowStart: 3, colSpan: 12, rowSpan: 1, config: { title: 'New' } },
      ],
    });
    expect(seeds.map((s) => s.type)).toEqual(['hero', 'cta', 'carouselNew']);
    expect(seeds[1].title).toBe('Go');
    expect(seeds[1].config?.buttonHref).toBe('/products');
  });

  it('dedupes keys and skips empty layouts', () => {
    expect(layoutHomeToSeeds(null)).toEqual([]);
    const seeds = layoutHomeToSeeds({
      blocks: [
        { id: 'hero', type: 'hero', rowStart: 1, colStart: 1, config: {} },
        { id: 'hero', type: 'hero', rowStart: 2, colStart: 1, config: {} },
      ],
    });
    expect(seeds.map((s) => s.key)).toEqual(['hero', 'hero-2']);
  });

  it('every bundled theme.json ships a home layout that maps to sections', () => {
    const dir = path.resolve(__dirname, '../../../../web/themes');
    const keys = readdirSync(dir).filter((k) => {
      try {
        return readFileSync(path.join(dir, k, 'theme.json'), 'utf8').length > 0;
      } catch {
        return false;
      }
    });
    const mapped: Record<string, number> = {};
    for (const key of keys) {
      const raw = JSON.parse(readFileSync(path.join(dir, key, 'theme.json'), 'utf8'));
      const seeds = layoutHomeToSeeds(raw.layouts?.home);
      mapped[key] = seeds.length;
      expect(seeds.length, `${key} missing layouts.home`).toBeGreaterThan(0);
    }
    expect(Object.keys(mapped).sort()).toEqual(['bold', 'dawnlight', 'default', 'minimal', 'pulse']);
  });
});
