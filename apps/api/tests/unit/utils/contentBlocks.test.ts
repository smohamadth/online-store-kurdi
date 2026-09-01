/**
 * contentBlocks.ts — CMS block storage helpers (pages + blog posts).
 *
 * The security-relevant contract: every HTML-bearing block field is
 * sanitised ON WRITE, so a compromised admin (or a hand-crafted POST)
 * can never store markup the storefront would dangerouslySetInnerHTML.
 */
import { describe, it, expect } from 'vitest';
import {
  serializeContentBlocks,
  parseBlocksColumn,
  withParsedBlocks,
} from '../../../src/utils/contentBlocks';

describe('serializeContentBlocks', () => {
  it('returns null for an empty list (column stays empty)', () => {
    expect(serializeContentBlocks([])).toBe(null);
    expect(serializeContentBlocks(null)).toBe(null);
  });

  it('sanitises richText config.html on write', () => {
    const out = serializeContentBlocks([
      { id: 'a', type: 'richText', config: { html: '<p>ok<script>alert(1)</script></p>' } },
    ]);
    const parsed = JSON.parse(out as string);
    expect(parsed[0].config.html).not.toContain('<script>');
    expect(parsed[0].config.html).toContain('ok');
  });

  it('sanitises the admin-designed custom block html on write', () => {
    const out = serializeContentBlocks([
      {
        id: 'a',
        type: 'custom',
        config: {
          title: 'Band',
          html: '<p>safe<img src=x onerror=alert(1)><script>evil()</script></p>',
          background: 'brand',
          padding: 'large',
          width: 'centered',
          align: 'center',
        },
      },
    ]);
    const parsed = JSON.parse(out as string);
    expect(parsed[0].config.html).not.toContain('<script>');
    expect(parsed[0].config.html).not.toContain('onerror');
    // Non-HTML config fields pass through untouched (they are rendered
    // as data, never as markup).
    expect(parsed[0].config.background).toBe('brand');
    expect(parsed[0].config.padding).toBe('large');
    expect(parsed[0].config.width).toBe('centered');
    expect(parsed[0].config.align).toBe('center');
  });

  it('leaves a custom block without html untouched', () => {
    const out = serializeContentBlocks([
      { id: 'a', type: 'custom', config: { title: 'Only a title' } },
    ]);
    const parsed = JSON.parse(out as string);
    expect(parsed[0].config).toEqual({ title: 'Only a title' });
  });

  it('still sanitises two-column html and drops malformed entries', () => {
    const out = serializeContentBlocks([
      { id: 'a', type: 'columns', config: { left: '<p>a</p>', right: '<p>b<script>x</script></p>' } },
      { id: 'b', type: 'heading', config: null },
      { bogus: true },
    ]);
    const parsed = JSON.parse(out as string);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].config.right).not.toContain('<script>');
  });
});

describe('parseBlocksColumn', () => {
  it('round-trips a serialized column', () => {
    const col = serializeContentBlocks([{ id: 'a', type: 'custom', config: { html: '<p>x</p>' } }]);
    expect(parseBlocksColumn(col)).toEqual([{ id: 'a', type: 'custom', config: { html: '<p>x</p>' } }]);
  });

  it('returns null for null / empty / malformed values', () => {
    expect(parseBlocksColumn(null)).toBe(null);
    expect(parseBlocksColumn('')).toBe(null);
    expect(parseBlocksColumn('{nope')).toBe(null);
    expect(parseBlocksColumn('{"not":"an array"}')).toBe(null);
  });
});

describe('withParsedBlocks', () => {
  it('hands clients a parsed blocks array instead of the JSON string', () => {
    const row = { id: 'p1', blocks: serializeContentBlocks([{ id: 'a', type: 'spacer', config: { size: 'md' } }]) };
    const out = withParsedBlocks(row);
    expect(out.blocks).toEqual([{ id: 'a', type: 'spacer', config: { size: 'md' } }]);
  });

  it('leaves null rows alone', () => {
    expect(withParsedBlocks(null)).toBe(null);
  });
});
