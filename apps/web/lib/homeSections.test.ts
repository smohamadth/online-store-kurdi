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
import { CREATABLE_TYPES, fetchHomeSections, TYPE_LABELS } from './homeSections';

describe('homeSections constants', () => {
  it('exposes a non-empty label map', () => {
    expect(Object.keys(TYPE_LABELS).length).toBeGreaterThan(0);
  });

  it('lists a sane set of creatable block types', () => {
    expect(CREATABLE_TYPES).toContain('richText');
    expect(CREATABLE_TYPES).toContain('gallery');
    // Singletons must NOT be creatable - they are edited in place.
    expect(CREATABLE_TYPES).not.toContain('hero');
    expect(CREATABLE_TYPES).not.toContain('categories');
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
