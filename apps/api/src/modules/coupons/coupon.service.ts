// ---------------------------------------------------------------------------
// Coupon validation (shared).
//
// Single implementation of the coupon business rules, used by BOTH the public
// POST /api/coupons/validate endpoint (advisory, drives the checkout display)
// and order placement (authoritative — order.routes.ts re-validates the
// coupon and recomputes the discount server-side instead of trusting the
// client's discountAmount, and refuses orders that carry an invalid coupon).
//
// Returns the coupon row + the computed, clamped discount. Throws
// CouponValidationError with a human-readable reason for every invalid state,
// so the public endpoint can render it and the order route can fail the order.
// ---------------------------------------------------------------------------
import { prisma } from '../../config/database';

export class CouponValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CouponValidationError';
  }
}

export interface CouponValidationResult {
  coupon: {
    id: string;
    code: string;
    type: string;
    value: number;
  };
  discount: number;
}

/**
 * Validate a coupon and compute the discount it grants for `subtotal`.
 *
 * Rules (in evaluation order): exists, active, not expired, not started,
 * usage limit, minimum order amount. The discount is clamped to the order
 * amount so a fixed coupon can never push the total negative.
 */
export async function validateCoupon(params: {
  /** Look up by id (order placement) or code (checkout display). */
  couponId?: string;
  code?: string;
  subtotal: number;
}): Promise<CouponValidationResult> {
  const { couponId, code, subtotal } = params;

  const coupon = couponId
    ? await prisma.coupon.findUnique({ where: { id: couponId } })
    : code
      ? await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } })
      : null;

  if (!coupon) {
    throw new CouponValidationError(code ? 'Invalid coupon code' : 'Invalid coupon');
  }

  if (!coupon.isActive) {
    throw new CouponValidationError('This coupon is no longer active');
  }

  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    throw new CouponValidationError('This coupon has expired');
  }

  if (coupon.startsAt && new Date(coupon.startsAt) > new Date()) {
    throw new CouponValidationError('This coupon is not yet active');
  }

  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
    throw new CouponValidationError('This coupon has reached its usage limit');
  }

  if (coupon.minOrderAmount && subtotal < Number(coupon.minOrderAmount)) {
    throw new CouponValidationError(
      `Minimum order amount is $${Number(coupon.minOrderAmount).toFixed(2)}`
    );
  }

  // Compute the discount.
  const orderAmount = subtotal || 0;
  let discount = 0;

  switch (coupon.type) {
    case 'percentage':
      discount = orderAmount * (Number(coupon.value) / 100);
      if (coupon.maxDiscountAmount) {
        discount = Math.min(discount, Number(coupon.maxDiscountAmount));
      }
      break;
    case 'fixed':
      discount = Number(coupon.value);
      break;
    case 'free_shipping':
      discount = 0; // handled separately (order.routes zeroes shipping)
      break;
  }

  // Never discount more than the order is worth. A fixed 50 coupon against a
  // 10 subtotal would otherwise produce a NEGATIVE order total.
  discount = Math.max(0, Math.min(discount, orderAmount));

  return {
    coupon: {
      id: coupon.id,
      code: coupon.code,
      type: coupon.type,
      value: Number(coupon.value),
    },
    discount: Math.round(discount * 100) / 100,
  };
}
