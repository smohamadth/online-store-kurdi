/**
 * pageBlocks.ts — page layout block model.
 *
 * Pins the storage contract (JSON string column <-> parsed array),
 * the tolerance for corrupt data (a page must never fail to render
 * because of a half-written blocks column), and the legacy fallback
 * (pages saved before blocks existed must still open in the editor).
 */
import { describe, it, expect } from 'vitest';
import {
  parsePageBlocks,
  serializePageBlocks,
  blocksFromLegacyContent,
  blocksToLegacyContent,
  newBlockId,
  newBlock,
  defaultBlockConfig,
  PAGE_BLOCK_TYPES,
  PAGE_BLOCK_LABELS,
  PAGE_BLOCK_ICONS,
  type PageBlock,
} from './pageBlocks';

const block = (type: string, config: Record<string, any> = {}, id = 'blk-1'): PageBlock => ({
  id,
  type: type as PageBlock['type'],
  config,
});

describe('parsePageBlocks', () => {
  it('returns [] for null / empty / undefined', () => {
    expect(parsePageBlocks(null)).toEqual([]);
    expect(parsePageBlocks(undefined)).toEqual([]);
    expect(parsePageBlocks('')).toEqual([]);
    expect(parsePageBlocks('   ')).toEqual([]);
  });

  it('parses a JSON string of well-formed blocks', () => {
    const raw = JSON.stringify([
      { id: 'a', type: 'heading', config: { text: 'Hi', level: 2 } },
      { id: 'b', type: 'callout', config: { text: 'Note', tone: 'info' } },
    ]);
    const out = parsePageBlocks(raw);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ id: 'a', type: 'heading', config: { text: 'Hi', level: 2 } });
  });

  it('accepts an already-parsed array', () => {
    const out = parsePageBlocks([{ id: 'a', type: 'divider', config: {} }]);
    expect(out).toEqual([{ id: 'a', type: 'divider', config: {} }]);
  });

  it('returns [] for malformed JSON instead of throwing', () => {
    expect(parsePageBlocks('{not json')).toEqual([]);
    expect(parsePageBlocks('"a string"')).toEqual([]);
    expect(parsePageBlocks('42')).toEqual([]);
  });

  it('drops entries that are not well-formed blocks', () => {
    const raw = JSON.stringify([
      { id: 'ok', type: 'spacer', config: { size: 'md' } },
      'nope',
      42,
      null,
      { type: 'heading' }, // missing id
      { id: 'x' }, // missing type
      { id: 'y', type: 'warp-drive', config: {} }, // unknown type
    ]);
    const out = parsePageBlocks(raw);
    expect(out).toEqual([{ id: 'ok', type: 'spacer', config: { size: 'md' } }]);
  });

  it('defaults a missing config to {}', () => {
    const out = parsePageBlocks(JSON.stringify([{ id: 'a', type: 'divider' }]));
    expect(out[0].config).toEqual({});
  });
});

describe('serializePageBlocks', () => {
  it('returns null for an empty list (column stays empty)', () => {
    expect(serializePageBlocks([])).toBeNull();
    expect(serializePageBlocks(null)).toBeNull();
    expect(serializePageBlocks(undefined)).toBeNull();
  });

  it('round-trips through parsePageBlocks', () => {
    const blocks = [
      block('richText', { html: '<p>Hi</p>' }, 'a'),
      block('columns', { left: '<p>L</p>', right: '<p>R</p>' }, 'b'),
      block('divider', {}, 'c'),
    ];
    const parsed = parsePageBlocks(serializePageBlocks(blocks));
    expect(parsed).toEqual(blocks);
  });

  it('only stores id/type/config keys', () => {
    const raw = serializePageBlocks([
      { id: 'a', type: 'callout', config: { text: 'x' }, extra: 'junk' } as any,
    ]);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual([{ id: 'a', type: 'callout', config: { text: 'x' } }]);
  });
});

describe('blocksFromLegacyContent', () => {
  it('wraps legacy content as a single richText block', () => {
    const out = blocksFromLegacyContent('<h2>Who we are</h2><p>Text</p>');
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('richText');
    expect(out[0].config.html).toBe('<h2>Who we are</h2><p>Text</p>');
  });

  it('returns [] for empty content', () => {
    expect(blocksFromLegacyContent('')).toEqual([]);
    expect(blocksFromLegacyContent('   ')).toEqual([]);
    expect(blocksFromLegacyContent(null)).toEqual([]);
    expect(blocksFromLegacyContent(undefined)).toEqual([]);
  });
});

describe('blocksToLegacyContent', () => {
  it('keeps rich text as-is', () => {
    expect(blocksToLegacyContent([block('richText', { html: '<p>Hi</p>' })])).toBe('<p>Hi</p>');
  });

  it('renders headings and callouts as plain text equivalents', () => {
    const out = blocksToLegacyContent([
      block('heading', { text: 'Shipping', level: 3 }),
      block('callout', { text: 'We ship fast.', tone: 'info' }),
    ]);
    expect(out).toContain('<h3>Shipping</h3>');
    expect(out).toContain('<p>We ship fast.</p>');
  });

  it('escapes user text in structural blocks', () => {
    const out = blocksToLegacyContent([block('heading', { text: 'A <script>' })]);
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('renders quotes as blockquote equivalents with attribution', () => {
    const out = blocksToLegacyContent([
      block('quote', { text: 'Great service.', attribution: 'Dana, owner' }),
    ]);
    expect(out).toBe('<blockquote>Great service. — Dana, owner</blockquote>');
  });

  it('escapes quote text and attribution', () => {
    const out = blocksToLegacyContent([
      block('quote', { text: '5 <script>', attribution: 'a<b' }),
    ]);
    expect(out).not.toContain('<script>');
    expect(out).not.toContain('a<b');
  });

  it('ignores structural-only blocks (image, gallery, divider, spacer, columns)', () => {
    const out = blocksToLegacyContent([
      block('image', { url: 'x.jpg' }),
      block('gallery', { images: [{ url: 'x.jpg', caption: 'c' }] }),
      block('divider', {}),
      block('spacer', { size: 'lg' }),
      block('columns', { left: '<p>a</p>', right: '<p>b</p>' }),
    ]);
    expect(out).toBe('');
  });

  it('returns empty string for no blocks', () => {
    expect(blocksToLegacyContent([])).toBe('');
    expect(blocksToLegacyContent(null)).toBe('');
  });
});

describe('newBlockId', () => {
  it('generates unique ids', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(newBlockId());
    expect(seen.size).toBe(500);
  });
});

describe('PAGE_BLOCK_TYPES', () => {
  it('covers the documented block set', () => {
    expect(PAGE_BLOCK_TYPES.sort()).toEqual(
      [
        'callout', 'columns', 'cta', 'divider', 'gallery', 'heading',
        'image', 'quote', 'richText', 'spacer',
      ].sort(),
    );
  });

  it('has a label and an icon for every type (the picker renders both)', () => {
    for (const t of PAGE_BLOCK_TYPES) {
      expect(PAGE_BLOCK_LABELS[t]).toBeTruthy();
      expect(PAGE_BLOCK_ICONS[t]).toBeTruthy();
    }
  });
});

describe('defaultBlockConfig / newBlock', () => {
  it('gives content blocks visible starter content', () => {
    expect(defaultBlockConfig('heading').text).toBeTruthy();
    expect(defaultBlockConfig('callout').text).toBeTruthy();
    expect(defaultBlockConfig('quote').text).toBeTruthy();
    expect(defaultBlockConfig('cta').label).toBe('Learn more');
    expect(defaultBlockConfig('cta').href).toBe('/contact');
    expect(defaultBlockConfig('gallery')).toEqual({
      images: [{ url: '', caption: '' }, { url: '', caption: '' }],
    });
    expect(defaultBlockConfig('columns').left).toBeTruthy();
    expect(defaultBlockConfig('divider')).toEqual({});
  });

  it('produces well-formed blocks with unique ids', () => {
    const a = newBlock('callout');
    const b = newBlock('callout');
    expect(a.id).not.toBe(b.id);
    expect(a.type).toBe('callout');
    // The id round-trips through parse/serialize (40-char cap).
    expect(a.id.length).toBeLessThanOrEqual(40);
    expect(parsePageBlocks(serializePageBlocks([a]))).toEqual([a]);
  });
});
