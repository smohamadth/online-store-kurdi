/** Homepage templates are ordered full-width sections, just like live HomeSection rows. */
import type { LayoutBlock, PageLayout } from './types';

function stack(blocks: LayoutBlock[]): PageLayout {
  return {
    columns: 1,
    gap: 0,
    blocks: blocks.map((block, index) => ({
      ...block, colStart: 1, colSpan: 1, rowStart: index + 1, rowSpan: 1,
    })),
  };
}

/** Preserve the visual order of older grid-authored templates without mutating them. */
export function homeStackLayout(layout: PageLayout): PageLayout {
  return stack([...layout.blocks].sort((a, b) => a.rowStart - b.rowStart || a.colStart - b.colStart));
}

/** Reordering must move persisted row positions, not just the array/paint order. */
export function moveHomeBlock(layout: PageLayout, id: string, delta: -1 | 1): PageLayout {
  const normalized = homeStackLayout(layout);
  const blocks = [...normalized.blocks];
  const index = blocks.findIndex((block) => block.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= blocks.length) return normalized;
  [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
  return stack(blocks);
}
