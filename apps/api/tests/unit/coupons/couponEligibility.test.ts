/**
 * Per-customer coupon eligibility.
 *
 * Coupon.usedCount is a single GLOBAL counter. On its own it cannot tell one
 * customer redeeming five times apart from five customers redeeming once, so
 * "one per customer" was inexpressible and a single-use code could be posted
 * publicly and drained by strangers.
 */
import { describe, it, expect } from 'vitest';
import {
  checkCustomerEligibility,
  PER_CUSTOMER_EXCEEDED, NEW_CUSTOMERS_ONLY, SIGN_IN_REQUIRED,
} from '../../../src/modules/coupons/couponEligibility';

const base = { redemptionsByUser: 0, priorOrderCount: 0 };

describe('unrestricted coupons keep their old behaviour', () => {
  it.each([[null], [undefined]])('perCustomerLimit=%j is unlimited', (limit) => {
    // Every coupon that existed before this feature has no per-customer cap;
    // they must not start rejecting anyone.
    expect(checkCustomerEligibility({ ...base, perCustomerLimit: limit, redemptionsByUser: 99 }))
      .toEqual({ eligible: true });
  });

  it('a guest may still use an unrestricted coupon', () => {
    expect(checkCustomerEligibility({ ...base, perCustomerLimit: null, isGuest: true }))
      .toEqual({ eligible: true });
  });

  it('newCustomersOnly=false does not restrict returning customers', () => {
    expect(checkCustomerEligibility({ ...base, newCustomersOnly: false, priorOrderCount: 12 }))
      .toEqual({ eligible: true });
  });
});

describe('perCustomerLimit', () => {
  it('allows the first redemption when the limit is 1', () => {
    expect(checkCustomerEligibility({ ...base, perCustomerLimit: 1, redemptionsByUser: 0 }))
      .toEqual({ eligible: true });
  });

  it('blocks the second redemption when the limit is 1', () => {
    expect(checkCustomerEligibility({ ...base, perCustomerLimit: 1, redemptionsByUser: 1 }))
      .toEqual({ eligible: false, reason: PER_CUSTOMER_EXCEEDED });
  });

  it('is a >= comparison, so an over-count still blocks', () => {
    // Defensive: a double-write in the ledger must not re-open the coupon.
    expect(checkCustomerEligibility({ ...base, perCustomerLimit: 2, redemptionsByUser: 5 }).eligible)
      .toBe(false);
  });

  it.each([
    [3, 0, true], [3, 1, true], [3, 2, true], [3, 3, false], [3, 4, false],
  ])('limit=%i used=%i -> eligible=%j', (limit, used, expected) => {
    expect(checkCustomerEligibility({ ...base, perCustomerLimit: limit, redemptionsByUser: used }).eligible)
      .toBe(expected);
  });

  it('a limit of 0 blocks everyone, including first-timers', () => {
    // 0 is a real value meaning "nobody", distinct from null meaning
    // "unlimited". Treating them the same would silently uncap the coupon.
    expect(checkCustomerEligibility({ ...base, perCustomerLimit: 0, redemptionsByUser: 0 }).eligible)
      .toBe(false);
  });
});

describe('newCustomersOnly', () => {
  it('allows a customer with no prior orders', () => {
    expect(checkCustomerEligibility({ ...base, newCustomersOnly: true, priorOrderCount: 0 }))
      .toEqual({ eligible: true });
  });

  it('blocks a customer who has ordered before', () => {
    expect(checkCustomerEligibility({ ...base, newCustomersOnly: true, priorOrderCount: 1 }))
      .toEqual({ eligible: false, reason: NEW_CUSTOMERS_ONLY });
  });
});

describe('guest checkout', () => {
  it('refuses a per-customer-limited coupon rather than granting it', () => {
    // If a guest were allowed through, "one per customer" would be bypassable
    // by simply logging out - the restriction would be decorative.
    expect(checkCustomerEligibility({ ...base, perCustomerLimit: 1, isGuest: true }))
      .toEqual({ eligible: false, reason: SIGN_IN_REQUIRED });
  });

  it('refuses a new-customers-only coupon for the same reason', () => {
    expect(checkCustomerEligibility({ ...base, newCustomersOnly: true, isGuest: true }))
      .toEqual({ eligible: false, reason: SIGN_IN_REQUIRED });
  });

  it('asks the guest to sign in rather than claiming the coupon is invalid', () => {
    // The code IS valid; the shopper just needs an identity. Saying "invalid"
    // would send them away thinking the promotion was broken.
    const r = checkCustomerEligibility({ ...base, perCustomerLimit: 1, isGuest: true });
    expect(r.eligible).toBe(false);
    expect((r as any).reason).toMatch(/sign in/i);
  });
});

describe('both restrictions together', () => {
  it('new-customer check takes precedence over the usage cap', () => {
    const r = checkCustomerEligibility({
      perCustomerLimit: 1, newCustomersOnly: true,
      redemptionsByUser: 1, priorOrderCount: 3,
    });
    expect(r).toEqual({ eligible: false, reason: NEW_CUSTOMERS_ONLY });
  });

  it('passes only when both are satisfied', () => {
    expect(checkCustomerEligibility({
      perCustomerLimit: 2, newCustomersOnly: true,
      redemptionsByUser: 1, priorOrderCount: 0,
    })).toEqual({ eligible: true });
  });
});
