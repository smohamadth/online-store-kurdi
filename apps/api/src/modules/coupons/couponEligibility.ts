/**
 * Per-customer coupon eligibility.
 *
 * Coupon.usedCount is a single GLOBAL counter, so before this existed:
 *   - "one per customer" could not be expressed at all, and
 *   - a single-use code could be shared publicly and drained by strangers
 *     while the intended recipient never got to use it.
 *
 * The decision logic is a pure function so it can be exhaustively unit-tested
 * without a database; the route layer supplies the two counts.
 */

export type EligibilityInput = {
  /** Per-customer cap. null/undefined = unlimited (pre-existing behaviour). */
  perCustomerLimit?: number | null;
  /** Restrict to customers with no prior completed order. */
  newCustomersOnly?: boolean | null;
  /** How many times THIS customer has already redeemed THIS coupon. */
  redemptionsByUser: number;
  /** How many completed orders this customer already has. */
  priorOrderCount: number;
  /** Anonymous checkout - no user to attribute redemptions to. */
  isGuest?: boolean;
};

export type EligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: string };

/** Message shown when a customer has exhausted their personal allowance. */
export const PER_CUSTOMER_EXCEEDED = 'You have already used this coupon';
/** Message shown when a returning customer tries a new-customers-only code. */
export const NEW_CUSTOMERS_ONLY = 'This coupon is only valid on your first order';
/** Message shown when a restricted coupon is used without signing in. */
export const SIGN_IN_REQUIRED = 'Please sign in to use this coupon';

export function checkCustomerEligibility(input: EligibilityInput): EligibilityResult {
  const {
    perCustomerLimit, newCustomersOnly, redemptionsByUser,
    priorOrderCount, isGuest,
  } = input;

  const isRestricted =
    (perCustomerLimit !== null && perCustomerLimit !== undefined) || !!newCustomersOnly;

  // A guest has no identity, so neither restriction can be enforced. Allowing
  // it would make "one per customer" trivially bypassable by logging out, so
  // the coupon is refused rather than silently unlimited.
  if (isGuest && isRestricted) {
    return { eligible: false, reason: SIGN_IN_REQUIRED };
  }

  if (newCustomersOnly && priorOrderCount > 0) {
    return { eligible: false, reason: NEW_CUSTOMERS_ONLY };
  }

  if (
    perCustomerLimit !== null &&
    perCustomerLimit !== undefined &&
    redemptionsByUser >= perCustomerLimit
  ) {
    return { eligible: false, reason: PER_CUSTOMER_EXCEEDED };
  }

  return { eligible: true };
}
