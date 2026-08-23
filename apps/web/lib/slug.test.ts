/**
 * slug.ts — Unicode-aware slug generator.
 *
 * Notable paths:
 *   - empty input returns an empty string (so the caller can decide what to do)
 *   - slugifyWithFallback always returns a non-empty slug (used in the admin
 *     "save page" form so an all-punctuation title still saves)
 *   - non-Latin scripts are preserved (Kurdish, Arabic, etc.)
 */
import { describe, it, expect } from 'vitest';
import { slugify, slugifyWithFallback } from './slug';

describe('slugify', () => {
  it('lowercases and replaces whitespace with hyphens', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('collapses repeated separators', () => {
    expect(slugify('foo --- bar')).toBe('foo-bar');
  });

  it('strips trailing hyphens', () => {
    expect(slugify('Hello!!!')).toBe('hello');
  });

  it('preserves non-Latin characters', () => {
    // The previous "strip non-Latin" rule produced an empty string here, which
    // is exactly the "new pages 404" bug.
    expect(slugify('Kurdish News')).toBe('kurdish-news');
    expect(slugify('خبری نوێ')).not.toBe('');
  });

  it('returns an empty string for pure punctuation', () => {
    expect(slugify('!!!')).toBe('');
  });

  it('caps the length at 120', () => {
    const long = 'a'.repeat(200);
    expect(slugify(long).length).toBeLessThanOrEqual(120);
  });

  it('trims leading and trailing whitespace before slugifying', () => {
    expect(slugify('  hi  ')).toBe('hi');
  });
});

describe('slugifyWithFallback', () => {
  it('returns a non-empty slug even when the input slugifies to nothing', () => {
    const out = slugifyWithFallback('!!!');
    expect(out).toMatch(/^page-/);
  });

  it('uses the normal slug when the input is fine', () => {
    expect(slugifyWithFallback('Hello World')).toBe('hello-world');
  });

  it('honours a custom fallback prefix', () => {
    expect(slugifyWithFallback('!!!', 'item').startsWith('item-')).toBe(true);
  });
});
