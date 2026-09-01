// ---------------------------------------------------------------------------
// Layout editing helpers — pure functions the Theme Studio canvas uses to add,
// move, resize and remove blocks within a PageLayout. Keeping them pure makes
// them trivially testable and lets the storefront renderer + the admin editor
// share the exact same data model.
// ---------------------------------------------------------------------------
import { PageLayout, LayoutBlock, BlockType } from './types';

let counter = 0;

export function newBlockId(): string {
  counter += 1;
  return `block-${Date.now()}-${counter}`;
}

/** Create a fresh full-width block of a given type. */
export function makeBlock(type: BlockType, columns: number): LayoutBlock {
  return {
    id: newBlockId(),
    type,
    colStart: 1,
    colSpan: columns,
    rowStart: 1,
    rowSpan: 1,
    config: {},
  };
}

/**
 * Append a new block of `type` onto the layout, auto-placing it on a new row
 * below the tallest existing block. Returns a new layout (never mutates).
 */
export function addBlock(layout: PageLayout, type: BlockType): PageLayout {
  const blocks = layout.blocks || [];
  const maxRowEnd = blocks.reduce((acc, b) => Math.max(acc, b.rowStart + b.rowSpan - 1), 0);
  const block: LayoutBlock = {
    ...makeBlock(type, layout.columns || 12),
    rowStart: maxRowEnd + 1,
  };
  return { ...layout, blocks: [...blocks, block] };
}

/**
 * Reorder a block by one position in z-index order (affects paint/tab order;
 * grid cells come from colStart/rowStart). `delta` is -1 (earlier) or +1
 * (later). Returns a new layout.
 */
export function moveBlock(layout: PageLayout, id: string, delta: -1 | 1): PageLayout {
  const blocks = [...layout.blocks];
  const idx = blocks.findIndex((b) => b.id === id);
  if (idx < 0) return layout;
  const target = idx + delta;
  if (target < 0 || target >= blocks.length) return layout;
  [blocks[idx], blocks[target]] = [blocks[target], blocks[idx]];
  return { ...layout, blocks };
}

/**
 * Resize a block's grid placement (colStart / colSpan / rowStart / rowSpan).
 * `value` is clamped to a sensible range so a block can never leave the grid.
 */
export function resizeBlock(
  layout: PageLayout,
  id: string,
  prop: 'colStart' | 'colSpan' | 'rowStart' | 'rowSpan',
  value: number,
): PageLayout {
  const cols = layout.columns || 12;
  const clamped = Math.max(1, value);
  return {
    ...layout,
    blocks: layout.blocks.map((b) => {
      if (b.id !== id) return b;
      const next: LayoutBlock = { ...b, [prop]: clamped };
      // A block can span at most the full column width.
      if (prop === 'colSpan') next.colSpan = Math.min(clamped, cols);
      // Never let a block spill past the right edge of the grid: clamp
      // colStart so colStart + colSpan - 1 <= columns. Otherwise an admin
      // could push a block off-grid and create implicit overflowing columns.
      next.colStart = Math.max(1, Math.min(next.colStart, cols - next.colSpan + 1));
      return next;
    }),
  };
}

/** Remove a block by id. Returns a new layout. */
export function removeBlock(layout: PageLayout, id: string): PageLayout {
  return { ...layout, blocks: layout.blocks.filter((b) => b.id !== id) };
}
