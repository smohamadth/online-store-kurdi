/**
 * Unit tests for the variant selector.
 */
import { describe, it, expect } from 'vitest';
import { pickVariant, defaultSelection, swatchLabel } from './variant-selector';
import type { Variant, Option } from './variant-types';

const options: Option[] = [
  {
    id: 'o-color', name: 'Color', sortOrder: 0,
    values: [
      { id: 'v-red', value: 'Red', swatch: '#ff0000', sortOrder: 0 },
      { id: 'v-blue', value: 'Blue', swatch: '#0000ff', sortOrder: 1 },
    ],
  },
  {
    id: 'o-size', name: 'Size', sortOrder: 1,
    values: [
      { id: 'v-s', value: 'Small', swatch: null, sortOrder: 0 },
      { id: 'v-l', value: 'Large', swatch: null, sortOrder: 1 },
    ],
  },
];

const variants: Variant[] = [
  {
    id: 'v-rs', productId: 'p', name: 'Red, Small', sku: 'rs', slug: 'red-small',
    price: 10, compareAtPrice: null, quantity: 5, isActive: true, sortOrder: 0,
    optionValues: [
      { optionValue: { value: 'Red', option: { name: 'Color' } } },
      { optionValue: { value: 'Small', option: { name: 'Size' } } },
    ],
  },
  {
    id: 'v-rl', productId: 'p', name: 'Red, Large', sku: 'rl', slug: 'red-large',
    price: 12, compareAtPrice: 15, quantity: 3, isActive: true, sortOrder: 1,
    optionValues: [
      { optionValue: { value: 'Red', option: { name: 'Color' } } },
      { optionValue: { value: 'Large', option: { name: 'Size' } } },
    ],
  },
  {
    id: 'v-bs', productId: 'p', name: 'Blue, Small', sku: 'bs', slug: 'blue-small',
    price: 11, compareAtPrice: null, quantity: 0, isActive: true, sortOrder: 2,
    optionValues: [
      { optionValue: { value: 'Blue', option: { name: 'Color' } } },
      { optionValue: { value: 'Small', option: { name: 'Size' } } },
    ],
  },
  {
    id: 'v-inactive', productId: 'p', name: 'Inactive', sku: 'ina', slug: null,
    price: 99, compareAtPrice: null, quantity: 99, isActive: false, sortOrder: 99,
    optionValues: [
      { optionValue: { value: 'Red', option: { name: 'Color' } } },
    ],
  },
];

describe('pickVariant', () => {
  it('returns undefined when there are no variants', () => {
    expect(pickVariant([], options, { Color: 'Red' })).toBeUndefined();
  });

  it('falls back to the first active variant when the product has no typed options', () => {
    const v = pickVariant(variants, [], {});
    expect(v?.id).toBe('v-rs');
  });

  it('returns undefined when no typed options and no variants are active', () => {
    const allInactive = variants.map((v) => ({ ...v, isActive: false }));
    expect(pickVariant(allInactive, [], {})).toBeUndefined();
  });

  it('matches a full Color + Size selection', () => {
    const v = pickVariant(variants, options, { Color: 'Red', Size: 'Large' });
    expect(v?.id).toBe('v-rl');
  });

  it('matches when only one of multiple options is chosen', () => {
    // Customer picked Red but not yet a size - the function should
    // still match the Red variants. The result is the first Red
    // variant in the list, ordered by sortOrder.
    const v = pickVariant(variants, options, { Color: 'Red' });
    expect(v?.id).toBe('v-rs');
  });

  it('skips inactive variants even if they match the options', () => {
    const local = [...variants, {
      id: 'v-extra', productId: 'p', name: 'Red, Small (inactive)', sku: 'x', slug: null,
      price: 1, compareAtPrice: null, quantity: 1, isActive: false, sortOrder: -1,
      optionValues: [
        { optionValue: { value: 'Red', option: { name: 'Color' } } },
        { optionValue: { value: 'Small', option: { name: 'Size' } } },
      ],
    } as Variant];
    // Without an active filter, the inactive variant should NOT
    // be returned.
    const v = pickVariant(local, options, { Color: 'Red', Size: 'Small' });
    expect(v?.id).toBe('v-rs'); // v-extra is inactive, skip it
  });

  it('returns undefined for a combination no variant offers', () => {
    const v = pickVariant(variants, options, { Color: 'Green' as any });
    expect(v).toBeUndefined();
  });
});

describe('defaultSelection', () => {
  it('returns the first value of each option, sorted by sortOrder', () => {
    const sel = defaultSelection(options);
    expect(sel).toEqual({ Color: 'Red', Size: 'Small' });
  });

  it('returns an empty object when there are no options', () => {
    expect(defaultSelection([])).toEqual({});
  });

  it('skips options with no values', () => {
    const sel = defaultSelection([
      { id: 'o1', name: 'A', sortOrder: 0, values: [] },
      { id: 'o2', name: 'B', sortOrder: 1, values: [{ id: 'v', value: 'X', swatch: null, sortOrder: 0 }] },
    ]);
    expect(sel).toEqual({ B: 'X' });
  });
});

describe('swatchLabel', () => {
  it('uppercases the first letter of short values', () => {
    expect(swatchLabel('red')).toBe('Red');
    expect(swatchLabel('small')).toBe('Small');
  });
  it('truncates long values with an ellipsis', () => {
    expect(swatchLabel('Navy Blue with a Hint of Green')).toBe('Navy Blue wi…');
  });
  it('returns empty string for empty input', () => {
    expect(swatchLabel('')).toBe('');
  });
});
