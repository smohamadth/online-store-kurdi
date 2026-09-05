/**
 * homeSections.ts — shared types and API for the home-page builder.
 *
 * Notable paths:
 *   - CREATABLE_TYPES is the set of blocks the admin can add (singleton
 *     blocks like the hero slider must be edited, not duplicated)
 *   - fetchHomeSections never throws on a 5xx - the page just renders
 *     with whatever was last returned
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CREATABLE_TYPES, fetchHomeSections, reorderSectionsByDrop, TYPE_ICONS, TYPE_LABELS } from './homeSections';

describe('homeSections constants', () => {
  it('exposes a non-empty label map', () => {
    expect(Object.keys(TYPE_LABELS).length).toBeGreaterThan(0);
  });

  it('lists a sane set of creatable block types', () => {
    expect(CREATABLE_TYPES).toContain('richText');
    expect(CREATABLE_TYPES).toContain('gallery');
    expect(CREATABLE_TYPES).toContain('newsletter');
    expect(CREATABLE_TYPES).toContain('dealCountdown');
    expect(CREATABLE_TYPES).toContain('cta');
    expect(CREATABLE_TYPES).toContain('steps');
    expect(CREATABLE_TYPES).toContain('pricing');
    // Singletons must NOT be creatable - they are edited in place.
    expect(CREATABLE_TYPES).not.toContain('hero');
    expect(CREATABLE_TYPES).not.toContain('categories');
  });

  it('lets the admin add a designed custom section on the home page', () => {
    expect(CREATABLE_TYPES).toContain('custom');
    expect(TYPE_LABELS['custom']).toBeTruthy();
    expect(TYPE_ICONS['custom']).toBeTruthy();
  });

  it('exposes the rich prebuilt blocks with labels and icons', () => {
    const RICH = ['faq', 'logos', 'video', 'comparison', 'quote', 'lookbook', 'showcaseRow'];
    for (const t of RICH) {
      expect(CREATABLE_TYPES, t).toContain(t);
      expect(TYPE_LABELS[t], t).toBeTruthy();
      expect(TYPE_ICONS[t], t).toBeTruthy();
    }
  });

  it('keeps every creatable type labelled (the builder’s Add menu) and vice versa', () => {
    const labelled = new Set(Object.keys(TYPE_LABELS));
    for (const t of CREATABLE_TYPES) {
      expect(labelled.has(t), `${t} is creatable but has no label`).toBe(true);
      expect(TYPE_ICONS[t], `${t} is creatable but has no icon`).toBeTruthy();
    }
  });
});

describe('reorderSectionsByDrop - drag-and-drop position math', () => {
  const items = [
    { id: 'a' },
    { id: 'b' },
    { id: 'c' },
    { id: 'd' },
  ];
  const ids = (next: { id: string }[]) => next.map((s) => s.id);

  it('drag from above, drop on the top half of the target (before it)', () => {
    expect(ids(reorderSectionsByDrop(items, 0, 2, false))).toEqual(['b', 'a', 'c', 'd']);
  });

  it('drag from above, drop on the bottom half of the target (after it)', () => {
    expect(ids(reorderSectionsByDrop(items, 0, 2, true))).toEqual(['b', 'c', 'a', 'd']);
  });

  it('drag from below, drop before the target', () => {
    expect(ids(reorderSectionsByDrop(items, 3, 1, false))).toEqual(['a', 'd', 'b', 'c']);
  });

  it('drag from below, drop after the target', () => {
    expect(ids(reorderSectionsByDrop(items, 3, 1, true))).toEqual(['a', 'b', 'd', 'c']);
  });

  it('adjacent move: from above onto the very next row, top half = no-op', () => {
    expect(ids(reorderSectionsByDrop(items, 1, 2, false))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('adjacent move: from above onto the very next row, bottom half = swaps', () => {
    expect(ids(reorderSectionsByDrop(items, 1, 2, true))).toEqual(['a', 'c', 'b', 'd']);
  });

  it('adjacent move: from below onto the very previous row, top half = swaps', () => {
    expect(ids(reorderSectionsByDrop(items, 2, 1, false))).toEqual(['a', 'c', 'b', 'd']);
  });

  it('adjacent move: from below onto the very previous row, bottom half = no-op', () => {
    expect(ids(reorderSectionsByDrop(items, 2, 1, true))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('moves to the very top', () => {
    expect(ids(reorderSectionsByDrop(items, 3, 0, false))).toEqual(['d', 'a', 'b', 'c']);
  });

  it('moves to the very bottom', () => {
    expect(ids(reorderSectionsByDrop(items, 0, 3, true))).toEqual(['b', 'c', 'd', 'a']);
  });

  it('dropping on the row being dragged is a no-op (same reference)', () => {
    expect(reorderSectionsByDrop(items, 1, 1, false)).toBe(items);
  });

  it('always preserves every item exactly once', () => {
    for (let d = 0; d < items.length; d++) {
      for (let t = 0; t < items.length; t++) {
        for (const after of [false, true]) {
          const out = ids(reorderSectionsByDrop(items, d, t, after));
          expect(out.slice().sort()).toEqual(['a', 'b', 'c', 'd']);
        }
      }
    }
  });
});

describe('fetchHomeSections', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the array from a successful response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', data: [{ id: 'a', key: 'hero' }] }),
    })) as any);
    const res = await fetchHomeSections();
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('a');
  });

  it('rejects on a 5xx (callers handle the error)', async () => {
    // The shared http client throws on non-2xx; the home page should fall
    // back to its last known good sections, which is handled at the caller
    // level - the function itself just surfaces the failure.
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => { throw new Error('boom'); },
    })) as any);
    await expect(fetchHomeSections()).rejects.toThrow();
  });
});
