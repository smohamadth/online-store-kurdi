/**
 * blockUtils — pure helpers for the rich pre-built blocks.
 *
 * toEmbedUrl is the seam that lets an admin paste a normal YouTube / Vimeo
 * link and get a safe <iframe> src, so we pin every accepted form + the
 * rejections. We also pin the list/field bookkeeping so the Studio editor and
 * the renderers stay in sync with the model.
 */
import { describe, it, expect } from 'vitest';
import { toEmbedUrl, itemsOf, LIST_BLOCK_TYPES, CONFIG_FIELDS } from './blockUtils';
import { BLOCK_TYPES, BlockType } from './types';

describe('toEmbedUrl', () => {
  it('converts youtube.com/watch?v= links', () => {
    expect(toEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    );
  });

  it('converts youtu.be short links', () => {
    expect(toEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
  });

  it('converts youtube.com/embed/ and /shorts/ links', () => {
    expect(toEmbedUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    );
    expect(toEmbedUrl('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    );
  });

  it('converts vimeo.com links (both forms)', () => {
    expect(toEmbedUrl('https://vimeo.com/123456789')).toBe('https://player.vimeo.com/video/123456789');
    expect(toEmbedUrl('https://vimeo.com/video/123456789')).toBe(
      'https://player.vimeo.com/video/123456789',
    );
  });

  it('returns null for direct files and junk', () => {
    expect(toEmbedUrl('https://example.com/video.mp4')).toBeNull();
    expect(toEmbedUrl('https://vimeo.com/')).toBeNull();
    expect(toEmbedUrl('not a url')).toBeNull();
    expect(toEmbedUrl('')).toBeNull();
  });
});

describe('itemsOf', () => {
  it('returns the items array', () => {
    expect(itemsOf({ items: [{ a: 1 }] })).toEqual([{ a: 1 }]);
  });
  it('returns [] when items is absent or not an array', () => {
    expect(itemsOf({})).toEqual([]);
    expect(itemsOf({ items: 'nope' })).toEqual([]);
    expect(itemsOf({ items: null })).toEqual([]);
  });
});

describe('rich-block bookkeeping (model ↔ renderer ↔ editor sync)', () => {
  it('every rich block is a known BlockType and present in BLOCK_TYPES', () => {
    const rich: BlockType[] = ['cta', 'video', 'image', 'textImage', 'divider', 'faq', 'steps', 'logoStrip', 'pricing', 'quote', 'iconsGrid'];
    const known = new Set<BlockType>(BLOCK_TYPES);
    for (const t of rich) expect(known.has(t)).toBe(true);
  });

  it('every list-based block has editor field definitions', () => {
    for (const t of LIST_BLOCK_TYPES) {
      expect(CONFIG_FIELDS[t]).toBeDefined();
    }
  });

  it('every rich scalar block with a custom editor is defined in CONFIG_FIELDS', () => {
    const withEditor: BlockType[] = ['cta', 'video', 'image', 'textImage', 'quote', 'iconsGrid'];
    for (const t of withEditor) expect(CONFIG_FIELDS[t]).toBeDefined();
  });

  it('every CONFIG_FIELDS key is a real BlockType', () => {
    const known = new Set<BlockType>(BLOCK_TYPES);
    for (const k of Object.keys(CONFIG_FIELDS)) expect(known.has(k as BlockType)).toBe(true);
  });
});
