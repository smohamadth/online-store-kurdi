/**
 * URL state codec for the product filter.
 *
 * Round-trip tests are the bulk of this file: the worst kind of bug
 * here is "encode and decode disagree" which would silently corrupt
 * the user's filter when they navigate. The non-round-trip tests
 * pin specific decisions (e.g. empty arrays drop out, sort=newest is
 * the default) so we can change them deliberately.
 */
import { describe, it, expect } from 'vitest';
import {
  encodeFilter,
  decodeFilter,
  isEmptyFilter,
  activeFilterCount,
  EMPTY_FILTER,
  SORT_VALUES,
} from './filterParams';

describe('encodeFilter', () => {
  it('returns an empty params for the default filter', () => {
    const params = encodeFilter(EMPTY_FILTER);
    expect(params.toString()).toBe('');
  });

  it('serialises multi-value fields as CSV', () => {
    const params = encodeFilter({ ...EMPTY_FILTER, category: ['clothing', 'books'] });
    expect(params.get('category')).toBe('clothing,books');
  });

  it('drops empty arrays', () => {
    const params = encodeFilter({ ...EMPTY_FILTER, category: [] });
    expect(params.has('category')).toBe(false);
  });

  it('serialises attribute filters with dot keys', () => {
    const params = encodeFilter({
      ...EMPTY_FILTER,
      attr: { size: ['M', 'L'], color: ['red'] },
    });
    expect(params.get('attr.size')).toBe('M,L');
    expect(params.get('attr.color')).toBe('red');
  });

  it('drops empty attribute values', () => {
    const params = encodeFilter({ ...EMPTY_FILTER, attr: { size: [] } });
    expect(params.has('attr.size')).toBe(false);
  });

  it('serialises booleans as the string "true" (omits when false)', () => {
    expect(encodeFilter({ ...EMPTY_FILTER, inStock: false }).has('inStock')).toBe(false);
    expect(encodeFilter({ ...EMPTY_FILTER, inStock: true }).get('inStock')).toBe('true');
    expect(encodeFilter({ ...EMPTY_FILTER, onSale: true }).get('onSale')).toBe('true');
  });

  it('omits sort=newest (the default)', () => {
    expect(encodeFilter({ ...EMPTY_FILTER, sort: 'newest' }).has('sort')).toBe(false);
    expect(encodeFilter({ ...EMPTY_FILTER, sort: 'price_asc' }).get('sort')).toBe('price_asc');
  });

  it('omits page=1 and limit=20 (the defaults)', () => {
    expect(encodeFilter({ ...EMPTY_FILTER, page: 1, limit: 20 }).toString()).toBe('');
    expect(encodeFilter({ ...EMPTY_FILTER, page: 2 }).get('page')).toBe('2');
  });

  it('strips a blank search query', () => {
    expect(encodeFilter({ ...EMPTY_FILTER, search: '   ' }).has('search')).toBe(false);
    expect(encodeFilter({ ...EMPTY_FILTER, search: 'shoes' }).get('search')).toBe('shoes');
  });

  it('encodes the price range', () => {
    const params = encodeFilter({ ...EMPTY_FILTER, minPrice: 10, maxPrice: 50 });
    expect(params.get('minPrice')).toBe('10');
    expect(params.get('maxPrice')).toBe('50');
  });

  it('omits a half-open price range', () => {
    const params = encodeFilter({ ...EMPTY_FILTER, minPrice: 10 });
    expect(params.has('minPrice')).toBe(true);
    expect(params.has('maxPrice')).toBe(false);
  });

  it('encodes optionValueId as CSV', () => {
    const params = encodeFilter({
      ...EMPTY_FILTER,
      optionValueId: ['a-1', 'b-2'],
    });
    expect(params.get('optionValueId')).toBe('a-1,b-2');
  });

  it('omits optionValueId when empty', () => {
    const params = encodeFilter({ ...EMPTY_FILTER, optionValueId: [] });
    expect(params.has('optionValueId')).toBe(false);
  });
});

describe('decodeFilter', () => {
  it('returns the default filter for an empty query', () => {
    const f = decodeFilter(new URLSearchParams());
    expect(f).toEqual(EMPTY_FILTER);
  });

  it('parses a comma-separated category', () => {
    const f = decodeFilter(new URLSearchParams('category=clothing,books'));
    expect(f.category).toEqual(['clothing', 'books']);
  });

  it('drops unknown type values (not in the enum)', () => {
    const f = decodeFilter(new URLSearchParams('type=physical,bogus,digital'));
    expect(f.type).toEqual(['physical', 'digital']);
  });

  it('parses dot-notation attribute filters', () => {
    const f = decodeFilter(new URLSearchParams('attr.size=M&attr.color=red'));
    expect(f.attr).toEqual({ size: ['M'], color: ['red'] });
  });

  it('parses repeated attribute values within one key', () => {
    const f = decodeFilter(new URLSearchParams('attr.size=M&attr.size=L'));
    expect(f.attr).toEqual({ size: ['M', 'L'] });
  });

  it('parses booleans', () => {
    expect(decodeFilter(new URLSearchParams('inStock=true')).inStock).toBe(true);
    expect(decodeFilter(new URLSearchParams('inStock=false')).inStock).toBe(false);
    expect(decodeFilter(new URLSearchParams('')).inStock).toBe(false);
  });

  it('parses numeric values (price, rating, page, limit)', () => {
    const f = decodeFilter(new URLSearchParams('minPrice=10&maxPrice=50&minRating=4&page=2&limit=30'));
    expect(f.minPrice).toBe(10);
    expect(f.maxPrice).toBe(50);
    expect(f.minRating).toBe(4);
    expect(f.page).toBe(2);
    expect(f.limit).toBe(30);
  });

  it('treats empty values as absent', () => {
    const f = decodeFilter(new URLSearchParams('minPrice=&maxPrice='));
    expect(f.minPrice).toBeUndefined();
    expect(f.maxPrice).toBeUndefined();
  });

  it('clamps sort to the known enum', () => {
    expect(decodeFilter(new URLSearchParams('sort=price_asc')).sort).toBe('price_asc');
    expect(decodeFilter(new URLSearchParams('sort=bogus')).sort).toBe('newest');
  });

  it('accepts a Next-style object as input', () => {
    const f = decodeFilter({ category: 'clothing,books', inStock: 'true' });
    expect(f.category).toEqual(['clothing', 'books']);
    expect(f.inStock).toBe(true);
  });

  it('handles array values from Next (takes the first)', () => {
    const f = decodeFilter({ category: ['clothing', 'books'] });
    expect(f.category).toEqual(['clothing', 'books']);
  });

  it('parses optionValueId as a CSV list', () => {
    const f = decodeFilter(new URLSearchParams('optionValueId=a-1,b-2'));
    expect(f.optionValueId).toEqual(['a-1', 'b-2']);
  });
});

describe('encode/decode round-trip', () => {
  it('preserves every supported field', () => {
    const original = {
      ...EMPTY_FILTER,
      page: 3,
      limit: 24,
      category: ['clothing', 'books', 'sale'],
      type: ['physical' as const, 'digital' as const],
      attr: { size: ['M', 'L'], color: ['red', 'blue'] },
      inStock: true,
      onSale: true,
      minRating: 4,
      minPrice: 20,
      maxPrice: 80,
      search: 'red shoes',
      sort: 'rating_desc' as const,
    };
    const encoded = encodeFilter(original);
    const decoded = decodeFilter(encoded);
    expect(decoded).toEqual(original);
  });

  it('preserves a price-only filter (minPrice only)', () => {
    const original = { ...EMPTY_FILTER, minPrice: 25 };
    expect(decodeFilter(encodeFilter(original))).toEqual(original);
  });

  it('preserves an attribute-only filter', () => {
    const original = { ...EMPTY_FILTER, attr: { size: ['M'] } };
    expect(decodeFilter(encodeFilter(original))).toEqual(original);
  });

  it('preserves a relevance search', () => {
    const original = { ...EMPTY_FILTER, search: 'red shoes', sort: 'relevance' as const };
    expect(decodeFilter(encodeFilter(original))).toEqual(original);
  });

  it('preserves a typed-option filter (optionValueId list)', () => {
    const original = {
      ...EMPTY_FILTER,
      optionValueId: ['ov-1', 'ov-2'],
    };
    expect(decodeFilter(encodeFilter(original))).toEqual(original);
  });
});

describe('isEmptyFilter', () => {
  it('returns true for the default', () => {
    expect(isEmptyFilter(EMPTY_FILTER)).toBe(true);
  });
  it('returns false when any field is set', () => {
    expect(isEmptyFilter({ ...EMPTY_FILTER, inStock: true })).toBe(false);
    expect(isEmptyFilter({ ...EMPTY_FILTER, onSale: true })).toBe(false);
    expect(isEmptyFilter({ ...EMPTY_FILTER, category: ['x'] })).toBe(false);
    expect(isEmptyFilter({ ...EMPTY_FILTER, attr: { size: ['M'] } })).toBe(false);
    expect(isEmptyFilter({ ...EMPTY_FILTER, minRating: 4 })).toBe(false);
    expect(isEmptyFilter({ ...EMPTY_FILTER, minPrice: 10 })).toBe(false);
    expect(isEmptyFilter({ ...EMPTY_FILTER, maxPrice: 100 })).toBe(false);
    expect(isEmptyFilter({ ...EMPTY_FILTER, search: 'a' })).toBe(false);
    expect(isEmptyFilter({ ...EMPTY_FILTER, sort: 'price_asc' })).toBe(false);
    expect(isEmptyFilter({ ...EMPTY_FILTER, optionValueId: ['ov-1'] })).toBe(false);
  });
});

describe('activeFilterCount', () => {
  it('returns 0 for the default', () => {
    expect(activeFilterCount(EMPTY_FILTER)).toBe(0);
  });
  it('counts multi-value fields as 1 per value', () => {
    expect(activeFilterCount({ ...EMPTY_FILTER, category: ['a', 'b', 'c'] })).toBe(3);
  });
  it('sums all the dimensions', () => {
    const f = {
      ...EMPTY_FILTER,
      category: ['a', 'b'],
      type: ['physical' as const, 'digital' as const],
      attr: { size: ['M', 'L'], color: ['red'] },
      inStock: true,
      onSale: true,
      minRating: 4,
      minPrice: 10,
      maxPrice: 100,
      search: 'shoes',
      sort: 'rating_desc' as const,
    };
    // 2 + 2 + 3 + 1 + 1 + 1 + 1 + 1 + 1 = 13
    expect(activeFilterCount(f)).toBe(13);
  });
  it('counts each optionValueId as one', () => {
    expect(activeFilterCount({ ...EMPTY_FILTER, optionValueId: ['a', 'b'] })).toBe(2);
  });
});

describe('SORT_VALUES', () => {
  it('includes the 9 expected sort keys', () => {
    expect(SORT_VALUES).toEqual([
      'newest',
      'oldest',
      'price_asc',
      'price_desc',
      'name_asc',
      'name_desc',
      'rating_desc',
      'popular',
      'relevance',
    ]);
  });
});
