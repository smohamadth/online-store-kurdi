'use client';

import { authHttp, http } from './http';

/**
 * Coupon API.
 *
 * Rewritten onto the shared HTTP client. The previous version:
 *   - rebuilt the API URL and Authorization header in all six functions
 *   - shipped a hardcoded SAMPLE_COUPONS list (WELCOME10 / SAVE20 / FREESHIP)
 *     and fell back to it whenever the API failed, so a customer could get
 *     10% or $20 off with codes the store had never created — and the admin
 *     panel listed coupons that did not exist in the database
 *   - swallowed every error, so a failed save looked like a success
 *
 * The database is now the only source of coupon truth; failures surface.
 */

export interface Coupon {
  id: string;
  code: string;
  type: 'percentage' | 'fixed' | 'free_shipping';
  value: number;
  minOrderAmount: number | null;
  maxDiscountAmount: number | null;
  usageLimit: number | null;
  usedCount: number;
  isActive: boolean;
  startsAt: string | null;
  expiresAt: string | null;
}

export interface CouponValidation {
  valid: boolean;
  coupon?: Coupon;
  discount?: number;
  error?: string;
}

/** All coupons (admin). Throws ApiError so the caller can show the reason. */
export async function getCoupons(_token?: string): Promise<Coupon[]> {
  const res = await authHttp.get<Coupon[]>('/coupons');
  return res.data || [];
}

/**
 * Validate a coupon against the server.
 *
 * Discounts must never be calculated in the browser — the amount has to come
 * from the same code that will charge the customer.
 */
export async function validateCoupon(
  code: string,
  subtotal: number
): Promise<CouponValidation> {
  try {
    const res = await http.post<CouponValidation>('/coupons/validate', { code, subtotal });
    return res.data || { valid: false, error: 'Invalid coupon code' };
  } catch (err: any) {
    // A rejected coupon is a normal outcome, not a crash: show why.
    return { valid: false, error: err?.message || 'Could not validate this coupon.' };
  }
}

export function formatDiscount(coupon: Coupon): string {
  switch (coupon.type) {
    case 'percentage':
      return `${coupon.value}% off`;
    case 'fixed':
      return `${coupon.value} off`;
    case 'free_shipping':
      return 'Free shipping';
    default:
      return '';
  }
}

export async function createCoupon(
  _token: string,
  couponData: Partial<Coupon>
): Promise<Coupon | null> {
  const res = await authHttp.post<Coupon>('/coupons', couponData);
  return res.data || null;
}

export async function updateCoupon(
  _token: string,
  couponId: string,
  couponData: Partial<Coupon>
): Promise<Coupon | null> {
  const res = await authHttp.put<Coupon>(`/coupons/${couponId}`, couponData);
  return res.data || null;
}

export async function deleteCoupon(_token: string, couponId: string): Promise<boolean> {
  await authHttp.delete(`/coupons/${couponId}`);
  return true;
}
