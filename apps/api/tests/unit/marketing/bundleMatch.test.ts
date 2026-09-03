/**
 * Bundle matching against order lines.
 *
 * This decides how much money comes off a real order, so the edge cases are
 * the point: partial sets must not discount, overlapping bundles must not
 * claim the same goods twice, and a malformed bundle must not produce an
 * unbounded discount.
 */
import { describe, it, expect } from 'vitest';
import {
  countCompleteSets, bundleDiscountFor, computeBundleDiscount,
  type MatchableBundle, type OrderLine,
} from '../../../src/modules/marketing/bundleMatch';

const KIT: MatchableBundle = {
  id: 'b1', slug: 'kit', discountType: 'percentage', discountValue: 25,
  items: [{ productId: 'A', quantity: 1 }, { productId: 'B', quantity: 1 }],
};

const line = (productId: string, quantity: number, unitPrice: number): OrderLine =>
  ({ productId, quantity, unitPrice });

describe('countCompleteSets', () => {
  it('counts one set when every component is present', () => {
    expect(countCompleteSets(KIT, [line('A', 1, 60), line('B', 1, 40)])).toBe(1);
  });

  it('counts multiple sets', () => {
    expect(countCompleteSets(KIT, [line('A', 3, 60), line('B', 3, 40)])).toBe(3);
  });

  it('is limited by the scarcest component', () => {
    // Five widgets and one gadget is one set, not five.
    expect(countCompleteSets(KIT, [line('A', 5, 60), line('B', 1, 40)])).toBe(1);
  });

  it('is zero when a component is missing entirely', () => {
    // Otherwise a shopper buys the cheap half of a set at bundle pricing.
    expect(countCompleteSets(KIT, [line('A', 5, 60)])).toBe(0);
  });

  it('is zero when a component is short', () => {
    const bundle = { ...KIT, items: [{ productId: 'A', quantity: 3 }, { productId: 'B', quantity: 1 }] };
    expect(countCompleteSets(bundle, [line('A', 2, 60), line('B', 9, 40)])).toBe(0);
  });

  it('respects component quantities above one', () => {
    const bundle = { ...KIT, items: [{ productId: 'A', quantity: 2 }, { productId: 'B', quantity: 1 }] };
    expect(countCompleteSets(bundle, [line('A', 4, 60), line('B', 2, 40)])).toBe(2);
  });

  it('sums duplicate lines for the same product', () => {
    // Two lines of the same product (different variants) still add up.
    expect(countCompleteSets(KIT, [line('A', 1, 60), line('A', 1, 60), line('B', 2, 40)])).toBe(2);
  });

  it('is zero for a bundle with no items', () => {
    expect(countCompleteSets({ ...KIT, items: [] }, [line('A', 9, 1)])).toBe(0);
  });

  it('is zero when a component requires zero units', () => {
    // A malformed bundle must not divide by zero into Infinity sets - that
    // would be an unbounded discount.
    const bad = { ...KIT, items: [{ productId: 'A', quantity: 0 }] };
    expect(countCompleteSets(bad, [line('A', 5, 60)])).toBe(0);
  });

  it('ignores negative quantities rather than trusting them', () => {
    expect(countCompleteSets(KIT, [line('A', -5, 60), line('B', 1, 40)])).toBe(0);
  });

  it('is zero for an empty order', () => {
    expect(countCompleteSets(KIT, [])).toBe(0);
  });
});

describe('bundleDiscountFor', () => {
  it('computes the percentage saving for one set', () => {
    const m = bundleDiscountFor(KIT, [line('A', 1, 60), line('B', 1, 40)]);
    expect(m).toMatchObject({ bundleId: 'b1', sets: 1, discount: 25 });
  });

  it('multiplies the saving by the number of sets', () => {
    const m = bundleDiscountFor(KIT, [line('A', 2, 60), line('B', 2, 40)]);
    expect(m!.sets).toBe(2);
    expect(m!.discount).toBe(50);
  });

  it('handles a fixed-price bundle', () => {
    const fixed = { ...KIT, discountType: 'fixed', discountValue: 80 };
    expect(bundleDiscountFor(fixed, [line('A', 1, 60), line('B', 1, 40)])!.discount).toBe(20);
  });

  it('returns null when the set is incomplete', () => {
    expect(bundleDiscountFor(KIT, [line('A', 1, 60)])).toBeNull();
  });

  it('returns null when the discount works out to zero', () => {
    // A 0% bundle is not a deal; reporting it would show "Save $0.00".
    const zero = { ...KIT, discountValue: 0 };
    expect(bundleDiscountFor(zero, [line('A', 1, 60), line('B', 1, 40)])).toBeNull();
  });

  it('prices from the ORDER line price, not a catalogue price', () => {
    // If a line is already discounted for another reason, the bundle
    // percentage must apply to what the customer actually pays, or the two
    // discounts compound into more than either intended.
    const m = bundleDiscountFor(KIT, [line('A', 1, 30), line('B', 1, 10)]);
    expect(m!.discount).toBe(10);   // 25% of 40, not of 100
  });

  it('never returns a discount above the set value', () => {
    const huge = { ...KIT, discountType: 'percentage', discountValue: 500 };
    const m = bundleDiscountFor(huge, [line('A', 1, 60), line('B', 1, 40)]);
    expect(m!.discount).toBeLessThanOrEqual(100);
  });

  it('rounds to cents', () => {
    const odd = { ...KIT, discountValue: 33.333 };
    const m = bundleDiscountFor(odd, [line('A', 1, 10), line('B', 1, 0)]);
    expect(String(m!.discount).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2);
  });
});

describe('computeBundleDiscount', () => {
  it('is zero when no bundles are configured', () => {
    expect(computeBundleDiscount([], [line('A', 1, 60)]))
      .toEqual({ matches: [], totalDiscount: 0 });
  });

  it('is zero when nothing matches', () => {
    expect(computeBundleDiscount([KIT], [line('Z', 5, 10)]).totalDiscount).toBe(0);
  });

  it('sums independent bundles that share no products', () => {
    const other: MatchableBundle = {
      id: 'b2', slug: 'other', discountType: 'fixed', discountValue: 15,
      items: [{ productId: 'C', quantity: 1 }, { productId: 'D', quantity: 1 }],
    };
    const r = computeBundleDiscount([KIT, other], [
      line('A', 1, 60), line('B', 1, 40), line('C', 1, 10), line('D', 1, 10),
    ]);
    expect(r.matches).toHaveLength(2);
    expect(r.totalDiscount).toBe(30);   // 25 + (20 - 15)
  });

  it('does NOT let two overlapping bundles claim the same goods twice', () => {
    // The expensive bug: one cart of A+B discounted by both bundles means the
    // store pays out twice for goods bought once.
    const overlapping: MatchableBundle = {
      id: 'b2', slug: 'overlap', discountType: 'percentage', discountValue: 10,
      items: [{ productId: 'A', quantity: 1 }, { productId: 'B', quantity: 1 }],
    };
    const r = computeBundleDiscount([KIT, overlapping], [line('A', 1, 60), line('B', 1, 40)]);
    expect(r.matches).toHaveLength(1);
    expect(r.totalDiscount).toBe(25);
  });

  it('applies the BEST overlapping bundle to the customer', () => {
    const better: MatchableBundle = {
      id: 'b2', slug: 'better', discountType: 'percentage', discountValue: 40,
      items: [{ productId: 'A', quantity: 1 }, { productId: 'B', quantity: 1 }],
    };
    const r = computeBundleDiscount([KIT, better], [line('A', 1, 60), line('B', 1, 40)]);
    expect(r.matches[0].slug).toBe('better');
    expect(r.totalDiscount).toBe(40);
  });

  it('lets a second overlapping bundle claim the LEFTOVER units', () => {
    // Four of each: the best bundle takes what it can, the other may still
    // apply to what remains - but never to the same units.
    const other: MatchableBundle = {
      id: 'b2', slug: 'zz-other', discountType: 'fixed', discountValue: 90,
      items: [{ productId: 'A', quantity: 2 }, { productId: 'B', quantity: 2 }],
    };
    const r = computeBundleDiscount([KIT, other], [line('A', 4, 60), line('B', 4, 40)]);
    const claimedA = r.matches.reduce((n, m) => {
      const b = [KIT, other].find((x) => x.id === m.bundleId)!;
      return n + (b.items.find((i) => i.productId === 'A')?.quantity ?? 0) * m.sets;
    }, 0);
    expect(claimedA).toBeLessThanOrEqual(4);
  });

  it('is deterministic when two bundles offer the same discount', () => {
    // Row order from the database must not change what a customer pays.
    const twin: MatchableBundle = { ...KIT, id: 'b2', slug: 'aaa-twin' };
    const a = computeBundleDiscount([KIT, twin], [line('A', 1, 60), line('B', 1, 40)]);
    const b = computeBundleDiscount([twin, KIT], [line('A', 1, 60), line('B', 1, 40)]);
    expect(a.matches[0].slug).toBe(b.matches[0].slug);
    expect(a.totalDiscount).toBe(b.totalDiscount);
  });

  it('never discounts more than the goods are worth', () => {
    const freebie = { ...KIT, discountType: 'percentage', discountValue: 100 };
    const r = computeBundleDiscount([freebie], [line('A', 1, 60), line('B', 1, 40)]);
    expect(r.totalDiscount).toBeLessThanOrEqual(100);
  });

  it('tolerates a malformed bundle without throwing', () => {
    const broken = { id: 'x', slug: 'x', discountType: 'percentage', discountValue: 10, items: [] };
    expect(() => computeBundleDiscount([broken as any], [line('A', 1, 10)])).not.toThrow();
    expect(computeBundleDiscount([broken as any], [line('A', 1, 10)]).totalDiscount).toBe(0);
  });
});
