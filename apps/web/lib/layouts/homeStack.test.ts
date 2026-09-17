import { describe, it, expect } from 'vitest';
import { homeStackLayout, moveHomeBlock } from './homeStack';
import { layoutToHomeSections } from './homeMapping';
import type { PageLayout } from './types';

const legacy: PageLayout = {
  columns: 12, gap: 24, blocks: [
    { id: 'last', type: 'newsletter', colStart: 1, colSpan: 12, rowStart: 4, rowSpan: 2, config: { title: 'Keep me' } },
    { id: 'right', type: 'cta', colStart: 7, colSpan: 6, rowStart: 1, rowSpan: 1, config: {} },
    { id: 'left', type: 'richText', colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 1, config: {} },
  ],
};

describe('home template stack', () => {
  it('keeps old grid visual order, IDs and content while removing unsupported placement', () => {
    const before = JSON.stringify(legacy);
    const layout = homeStackLayout(legacy);
    expect(layout.columns).toBe(1);
    expect(layout.gap).toBe(0);
    expect(layout.blocks.map((b) => b.id)).toEqual(['left', 'right', 'last']);
    expect(layout.blocks.map((b) => b.rowStart)).toEqual([1, 2, 3]);
    expect(layout.blocks.every((b) => b.colStart === 1 && b.colSpan === 1 && b.rowSpan === 1)).toBe(true);
    expect(layout.blocks[2].config.title).toBe('Keep me');
    expect(JSON.stringify(legacy)).toBe(before);
    expect(homeStackLayout(layout)).toEqual(layout);
  });

  it('reorders the rows that the preview and replacement mapping actually consume', () => {
    const moved = moveHomeBlock(legacy, 'last', -1);
    expect(moved.blocks.map((b) => b.id)).toEqual(['left', 'last', 'right']);
    expect(layoutToHomeSections(moved).map((b) => b.id)).toEqual(['left', 'last', 'right']);
    expect(moveHomeBlock(moved, 'last', 1)).toEqual(homeStackLayout(legacy));
  });

  it('keeps edge moves and unknown IDs safe, and supports a genuinely empty template', () => {
    expect(moveHomeBlock(legacy, 'left', -1)).toEqual(homeStackLayout(legacy));
    expect(moveHomeBlock(legacy, 'last', 1)).toEqual(homeStackLayout(legacy));
    expect(moveHomeBlock(legacy, 'unknown', -1)).toEqual(homeStackLayout(legacy));
    expect(homeStackLayout({ columns: 12, gap: 24, blocks: [] }).blocks).toEqual([]);
  });
});
