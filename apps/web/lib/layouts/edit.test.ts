/**
 * edit.ts — pure layout-editing helpers (the Theme Studio canvas operations).
 *
 * These helpers are deliberately pure so the admin editor and the storefront
 * renderer share exactly one data model and the operations are trivially
 * testable. We pin the invariants an admin depends on:
 *   - addBlock appends on a new row below the tallest block, never mutating
 *   - moveBlock reorders without touching grid coordinates
 *   - resizeBlock clamps so a block never leaves the grid
 *   - removeBlock drops exactly the requested block
 */
import { describe, it, expect } from 'vitest';
import { addBlock, moveBlock, resizeBlock, removeBlock, newBlockId } from './edit';
import { PageLayout, LayoutBlock } from './types';

function baseLayout(): PageLayout {
  return {
    columns: 12,
    gap: 24,
    blocks: [
      { id: 'a', type: 'hero', colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 1, config: { title: 'A' } },
      { id: 'b', type: 'featured', colStart: 1, colSpan: 6, rowStart: 2, rowSpan: 1, config: {} },
    ],
  };
}

describe('newBlockId', () => {
  it('returns a unique id on each call', () => {
    expect(newBlockId()).not.toBe(newBlockId());
  });
});

describe('addBlock', () => {
  it('does not mutate the input layout', () => {
    const l = baseLayout();
    const before = JSON.stringify(l);
    addBlock(l, 'stats');
    expect(JSON.stringify(l)).toBe(before);
  });

  it('places a new block on a fresh row below the tallest existing block', () => {
    const l = baseLayout();
    const next = addBlock(l, 'stats');
    expect(next.blocks).toHaveLength(3);
    const added = next.blocks[2];
    expect(added.type).toBe('stats');
    expect(added.rowStart).toBe(3); // below row 2's block
    expect(added.colStart).toBe(1);
    expect(added.colSpan).toBe(12); // full width by default
  });
});

describe('moveBlock', () => {
  it('moves a block forward in order', () => {
    const l = baseLayout();
    const next = moveBlock(l, 'a', 1);
    expect(next.blocks.map((b) => b.id)).toEqual(['b', 'a']);
    // grid coordinates unchanged
    expect(next.blocks.find((b) => b.id === 'a')).toEqual(l.blocks[0]);
  });

  it('moves a block backward in order', () => {
    const l = baseLayout();
    const next = moveBlock(l, 'b', -1);
    expect(next.blocks.map((b) => b.id)).toEqual(['b', 'a']);
  });

  it('clamps at the ends of the list', () => {
    const l = baseLayout();
    expect(moveBlock(l, 'a', -1).blocks.map((b) => b.id)).toEqual(['a', 'b']);
    expect(moveBlock(l, 'b', 1).blocks.map((b) => b.id)).toEqual(['a', 'b']);
  });

  it('is a no-op for an unknown id', () => {
    const l = baseLayout();
    expect(moveBlock(l, 'nope', 1)).toBe(l);
  });
});

describe('resizeBlock', () => {
  it('clamps colSpan to the column count', () => {
    const l = baseLayout();
    const next = resizeBlock(l, 'b', 'colSpan', 999);
    expect(next.blocks.find((b) => b.id === 'b')!.colSpan).toBe(12);
  });

  it('never allows a value below 1', () => {
    const l = baseLayout();
    const next = resizeBlock(l, 'b', 'colStart', -5);
    expect(next.blocks.find((b) => b.id === 'b')!.colStart).toBe(1);
  });

  it('updates row placement', () => {
    const l = baseLayout();
    const next = resizeBlock(l, 'b', 'rowSpan', 2);
    expect(next.blocks.find((b) => b.id === 'b')!.rowSpan).toBe(2);
  });

  it('clamps colStart so a block never spills off the grid', () => {
    const l: PageLayout = {
      columns: 12, gap: 24,
      blocks: [{ id: 'b', type: 'featured', colStart: 11, colSpan: 4, rowStart: 1, rowSpan: 1, config: {} }],
    };
    // 11 + 4 - 1 = 14 > 12, so colStart must be pulled back to 9.
    const next = resizeBlock(l, 'b', 'colStart', 11);
    const b = next.blocks.find((x) => x.id === 'b')!;
    expect(b.colStart + b.colSpan - 1).toBeLessThanOrEqual(12);
    expect(b.colStart).toBe(9);
  });

  it('keeps a full-width block pinned to column 1', () => {
    const l: PageLayout = {
      columns: 12, gap: 24,
      blocks: [{ id: 'b', type: 'hero', colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 1, config: {} }],
    };
    const next = resizeBlock(l, 'b', 'colStart', 5);
    expect(next.blocks.find((x) => x.id === 'b')!.colStart).toBe(1);
  });

  it('does not mutate the input', () => {
    const l = baseLayout();
    const before = JSON.stringify(l);
    resizeBlock(l, 'b', 'colSpan', 4);
    expect(JSON.stringify(l)).toBe(before);
  });
});

describe('removeBlock', () => {
  it('removes exactly the requested block', () => {
    const l = baseLayout();
    const next = removeBlock(l, 'a');
    expect(next.blocks).toHaveLength(1);
    expect(next.blocks[0].id).toBe('b');
  });

  it('does not mutate the input', () => {
    const l = baseLayout();
    const before = JSON.stringify(l);
    removeBlock(l, 'a');
    expect(JSON.stringify(l)).toBe(before);
  });
});
