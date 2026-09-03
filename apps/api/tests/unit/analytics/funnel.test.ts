/**
 * Conversion funnel arithmetic.
 *
 * The store could previously see THAT people did not convert but never WHERE
 * they dropped. The edge cases here (no traffic, impossible counts) are the
 * ones that turn a dashboard into a blank panel or a nonsense 130% figure.
 */
import { describe, it, expect } from 'vitest';
import {
  buildFunnel, biggestDropOff, FUNNEL_STEPS,
} from '../../../src/modules/analytics/funnel.helpers';

describe('buildFunnel shape', () => {
  it('always returns every step, in order', () => {
    const stages = buildFunnel({});
    expect(stages.map((s) => s.step)).toEqual([...FUNNEL_STEPS]);
  });

  it('reports zeroes - never NaN or null - with no traffic', () => {
    // A brand-new store hits this on day one. NaN serialises to null and the
    // dashboard renders blank cells instead of "0".
    for (const s of buildFunnel({})) {
      expect(Number.isFinite(s.conversionFromStart)).toBe(true);
      expect(Number.isFinite(s.conversionFromPrevious)).toBe(true);
      expect(s.count).toBe(0);
      expect(s.conversionFromStart).toBe(0);
      expect(s.droppedFromPrevious).toBe(0);
    }
  });
});

describe('conversion maths', () => {
  const counts = { view: 1000, add_to_cart: 250, begin_checkout: 100, purchase: 40 };

  it('computes conversion from the top of the funnel', () => {
    const s = buildFunnel(counts);
    expect(s[0].conversionFromStart).toBe(1);
    expect(s[1].conversionFromStart).toBe(0.25);
    expect(s[2].conversionFromStart).toBe(0.1);
    expect(s[3].conversionFromStart).toBe(0.04);
  });

  it('computes step-to-step conversion', () => {
    const s = buildFunnel(counts);
    expect(s[1].conversionFromPrevious).toBe(0.25);   // 250/1000
    expect(s[2].conversionFromPrevious).toBe(0.4);    // 100/250
    expect(s[3].conversionFromPrevious).toBe(0.4);    // 40/100
  });

  it('counts the users lost at each step', () => {
    const s = buildFunnel(counts);
    expect(s[1].droppedFromPrevious).toBe(750);
    expect(s[2].droppedFromPrevious).toBe(150);
    expect(s[3].droppedFromPrevious).toBe(60);
  });

  it('handles a perfect funnel', () => {
    const s = buildFunnel({ view: 10, add_to_cart: 10, begin_checkout: 10, purchase: 10 });
    expect(s.every((x) => x.conversionFromStart === 1)).toBe(true);
    expect(s.every((x) => x.droppedFromPrevious === 0)).toBe(true);
  });
});

describe('defends against impossible data', () => {
  it('clamps a step that exceeds the one before it', () => {
    // Real event streams are noisy: a purchase can arrive without its
    // begin_checkout. Un-clamped this renders as 200% conversion and makes
    // the whole report untrustworthy.
    const s = buildFunnel({ view: 100, add_to_cart: 50, begin_checkout: 80, purchase: 10 });
    expect(s[2].count).toBe(50);
    expect(s[2].conversionFromPrevious).toBeLessThanOrEqual(1);
  });

  it('never reports conversion above 100% anywhere', () => {
    const s = buildFunnel({ view: 1, add_to_cart: 999, begin_checkout: 999, purchase: 999 });
    for (const x of s) {
      expect(x.conversionFromStart).toBeLessThanOrEqual(1);
      expect(x.conversionFromPrevious).toBeLessThanOrEqual(1);
    }
  });

  it('treats negative counts as zero', () => {
    const s = buildFunnel({ view: -5, add_to_cart: -1 } as any);
    expect(s[0].count).toBe(0);
    expect(s[1].count).toBe(0);
  });

  it('floors fractional counts', () => {
    expect(buildFunnel({ view: 10.7 } as any)[0].count).toBe(10);
  });

  it('handles purchases with no recorded views', () => {
    // Direct links and stale sessions produce this. It must not divide by 0.
    const s = buildFunnel({ view: 0, purchase: 5 });
    expect(s[0].count).toBe(0);
    expect(s[3].count).toBe(0);
    expect(s[3].conversionFromStart).toBe(0);
  });

  it('ignores unknown keys rather than inventing steps', () => {
    const s = buildFunnel({ view: 10, nonsense: 99 } as any);
    expect(s).toHaveLength(FUNNEL_STEPS.length);
    expect(s[0].count).toBe(10);
  });
});

describe('biggestDropOff', () => {
  it('finds the worst absolute loss', () => {
    const s = buildFunnel({ view: 1000, add_to_cart: 250, begin_checkout: 100, purchase: 40 });
    expect(biggestDropOff(s)!.step).toBe('add_to_cart');
  });

  it('points at checkout when that is where people leave', () => {
    const s = buildFunnel({ view: 200, add_to_cart: 190, begin_checkout: 180, purchase: 10 });
    expect(biggestDropOff(s)!.step).toBe('purchase');
  });

  it('is null for a perfect funnel', () => {
    expect(biggestDropOff(buildFunnel({ view: 5, add_to_cart: 5, begin_checkout: 5, purchase: 5 })))
      .toBeNull();
  });

  it('is null with no traffic at all', () => {
    expect(biggestDropOff(buildFunnel({}))).toBeNull();
  });
});
