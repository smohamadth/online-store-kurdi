import { describe, it, expect } from 'vitest';
import { featuredProductsToShow } from './featuredGrid';

describe('featuredProductsToShow', () => {
  const items = [1, 2, 3, 4, 5];

  it('keeps leftover cards instead of dropping them for a full last row', () => {
    expect(featuredProductsToShow(items, undefined)).toEqual([1, 2, 3, 4, 5]);
  });

  it('honours config.limit', () => {
    expect(featuredProductsToShow(items, 3)).toEqual([1, 2, 3]);
    expect(featuredProductsToShow(items, 8)).toEqual([1, 2, 3, 4, 5]);
  });

  it('ignores junk limits', () => {
    expect(featuredProductsToShow(items, 0)).toEqual(items);
    expect(featuredProductsToShow(items, '8')).toEqual(items);
  });
});
