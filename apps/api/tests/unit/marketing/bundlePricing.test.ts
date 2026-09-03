/**
 * Bundle pricing.
 *
 * Pricing bugs are the expensive kind: an unclamped percentage or a bad fixed
 * price sells stock below cost, or presents a "saving" that costs the customer
 * more than buying the items separately.
 */
import { describe, it, expect } from 'vitest';
import {
  priceBundle, sumItems, round2, bundleAvailable,
} from '../../../src/modules/marketing/bundle.helpers';

describe('round2', () => {
  it.each([
    [10.005, 10.01], [0.1 + 0.2, 0.3], [99.999, 100], [10, 10], [0, 0],
  ])('rounds %j to %j', (input, expected) => {
    expect(round2(input)).toBe(expected);
  });

  it('coerces junk to 0 rather than producing NaN', () => {
    expect(round2(NaN)).toBe(0);
    expect(round2(undefined as any)).toBe(0);
  });
});

describe('sumItems', () => {
  it('multiplies price by quantity', () => {
    expect(sumItems([{ price: 10, quantity: 2 }, { price: 5.5, quantity: 3 }])).toBe(36.5);
  });

  it('is 0 for an empty bundle', () => {
    expect(sumItems([])).toBe(0);
  });

  it('ignores negative or fractional quantities safely', () => {
    expect(sumItems([{ price: 10, quantity: -3 }])).toBe(0);
    expect(sumItems([{ price: 10, quantity: 2.9 }])).toBe(20);
  });

  it('avoids float drift across many lines', () => {
    const lines = Array.from({ length: 10 }, () => ({ price: 0.1, quantity: 1 }));
    expect(sumItems(lines)).toBe(1);
  });
});

describe('percentage bundles', () => {
  it('applies the discount', () => {
    const p = priceBundle([{ price: 100, quantity: 1 }], 'percentage', 20);
    expect(p.bundlePrice).toBe(80);
    expect(p.savings).toBe(20);
    expect(p.savingsPercent).toBe(0.2);
  });

  it('0% means full price', () => {
    expect(priceBundle([{ price: 50, quantity: 2 }], 'percentage', 0).bundlePrice).toBe(100);
  });

  it('100% makes the bundle free but never negative', () => {
    const p = priceBundle([{ price: 50, quantity: 1 }], 'percentage', 100);
    expect(p.bundlePrice).toBe(0);
  });

  it('clamps above 100% instead of paying the customer', () => {
    // An admin typo of 150 must not produce a negative price.
    const p = priceBundle([{ price: 50, quantity: 1 }], 'percentage', 150);
    expect(p.bundlePrice).toBe(0);
    expect(p.bundlePrice).toBeGreaterThanOrEqual(0);
  });

  it('clamps a negative percentage instead of inflating the price', () => {
    const p = priceBundle([{ price: 50, quantity: 1 }], 'percentage', -20);
    expect(p.bundlePrice).toBe(50);
    expect(p.savings).toBe(0);
  });

  it('rounds to cents', () => {
    // 33.33% off 10.00 must not leak fractional cents into an invoice.
    const p = priceBundle([{ price: 10, quantity: 1 }], 'percentage', 33.333);
    expect(p.bundlePrice).toBe(round2(p.bundlePrice));
    expect(String(p.bundlePrice).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2);
  });
});

describe('fixed-price bundles', () => {
  it('uses the fixed value as the set price', () => {
    const p = priceBundle([{ price: 60, quantity: 1 }, { price: 40, quantity: 1 }], 'fixed', 75);
    expect(p.itemsTotal).toBe(100);
    expect(p.bundlePrice).toBe(75);
    expect(p.savings).toBe(25);
  });

  it('never prices the bundle above buying separately', () => {
    // Charging more for the "deal" than the sum of its parts is the worst
    // possible outcome: a customer-visible lie.
    const p = priceBundle([{ price: 10, quantity: 1 }], 'fixed', 999);
    expect(p.bundlePrice).toBe(10);
    expect(p.savings).toBe(0);
  });

  it('clamps a negative fixed price to zero', () => {
    expect(priceBundle([{ price: 10, quantity: 1 }], 'fixed', -5).bundlePrice).toBe(0);
  });
});

describe('degenerate inputs', () => {
  it('an empty bundle is priced at 0 with no divide-by-zero', () => {
    const p = priceBundle([], 'percentage', 50);
    expect(p).toEqual({ itemsTotal: 0, bundlePrice: 0, savings: 0, savingsPercent: 0 });
  });

  it('an unknown discount type falls back to percentage', () => {
    const p = priceBundle([{ price: 100, quantity: 1 }], 'nonsense' as any, 10);
    expect(p.bundlePrice).toBe(90);
  });

  it('savings and price always reconcile to the items total', () => {
    for (const [type, val] of [['percentage', 25], ['fixed', 33], ['percentage', 999]] as const) {
      const p = priceBundle([{ price: 20, quantity: 3 }], type, val);
      expect(round2(p.bundlePrice + p.savings)).toBe(p.itemsTotal);
    }
  });
});

describe('bundleAvailable', () => {
  const ok = { quantity: 1, product: { quantity: 5, status: 'active' } };

  it('is true when every component has stock', () => {
    expect(bundleAvailable([ok, { quantity: 2, product: { quantity: 2, status: 'active' } }])).toBe(true);
  });

  it('is false when any component is short', () => {
    // Partial availability must block the set, or checkout accepts an order
    // the store cannot fulfil.
    expect(bundleAvailable([ok, { quantity: 3, product: { quantity: 2, status: 'active' } }])).toBe(false);
  });

  it('is false when a component is not active', () => {
    expect(bundleAvailable([{ quantity: 1, product: { quantity: 99, status: 'draft' } }])).toBe(false);
  });

  it('is false when a component product is missing', () => {
    expect(bundleAvailable([{ quantity: 1, product: null }])).toBe(false);
  });

  it('is false for an empty bundle', () => {
    // An empty "bundle" is a configuration error, not a free purchase.
    expect(bundleAvailable([])).toBe(false);
  });

  it('allows exactly-enough stock', () => {
    expect(bundleAvailable([{ quantity: 2, product: { quantity: 2, status: 'active' } }])).toBe(true);
  });
});
