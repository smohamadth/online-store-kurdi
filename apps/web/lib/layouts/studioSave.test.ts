import { describe, it, expect } from 'vitest';
import { mergeStudioLayouts, studioHasUnsavedDrafts } from './studioSave';

describe('mergeStudioLayouts', () => {
  it('keeps saved pages and overlays drafts', () => {
    const merged = mergeStudioLayouts(
      { home: { columns: 12, gap: 8, blocks: [] } },
      { products: { columns: 12, gap: 24, blocks: [{ id: 'n', type: 'newsletter', colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 1, config: {} }] } },
    );
    expect((merged.home as { gap: number }).gap).toBe(8);
    expect((merged.products as { blocks: unknown[] }).blocks).toHaveLength(1);
  });
});

describe('studioHasUnsavedDrafts', () => {
  it('is false after a save that cleared drafts', () => {
    expect(studioHasUnsavedDrafts({})).toBe(false);
    expect(studioHasUnsavedDrafts({ home: { columns: 12, gap: 24, blocks: [] } })).toBe(true);
  });
});
