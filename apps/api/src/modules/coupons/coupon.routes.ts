// ---------------------------------------------------------------------------
// Coupons: admin CRUD + the public "validate this code" endpoint the
// checkout calls.
//
// Validation (POST /coupons/validate, shared with order placement via
// coupon.service) is where the business rules live: active flag,
// start/end dates, min-spend, and usage limits (usageLimit). It returns
// the computed discount so the client renders the savings before placing
// the order. At order time order.routes re-runs the same validation and
// recomputes the discount server-side, so the discountAmount in the order
// body is never trusted and an invalid coupon fails the order instead of
// being silently recorded.
// ---------------------------------------------------------------------------
import { Router } from 'express';
import { authenticate, authorize, optionalAuth } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';
import { validateCoupon, CouponValidationError } from './coupon.service';

const router = Router();

const COUPON_TYPES = new Set(['percentage', 'fixed', 'free_shipping']);

/**
 * Coerce a coupon money field. Accepts numbers and numeric strings (the
 * admin UI sends strings). Empty/absent -> fallback (null: unset). A value
 * that is not finite, or is negative, is rejected: parseFloat('1e999')
 * yields Infinity and `parseFloat(x) || 0` used to silently turn garbage
 * into a 0-value coupon — and Infinity percentage coupons broke every
 * checkout with a negative total.
 */
function couponNumber(v: unknown, fallback: number | null = null): number | null {
  if (v === undefined || v === null || v === '') return fallback;
  const n = typeof v === 'number' ? v : Number(String(v));
  if (!Number.isFinite(n) || n < 0) {
    throw new AppError('Coupon amount fields must be non-negative finite numbers', 400);
  }
  return n;
}

/** Parse a coupon date; rejects unparseable values instead of storing Invalid Date. */
function couponDate(v: unknown): Date | null {
  if (v === undefined || v === null || v === '') return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) {
    throw new AppError('Coupon dates must be valid dates', 400);
  }
  return d;
}

/** Parse the usage limit: positive integer, or null when unset. */
function couponUsageLimit(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v));
  if (!Number.isInteger(n) || n < 1) {
    throw new AppError('usageLimit must be a positive integer', 400);
  }
  return n;
}

// GET /api/coupons - Get all coupons (admin only)
router.get('/coupons', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const coupons = await prisma.coupon.findMany({
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      status: 'success',
      data: coupons,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/coupons/:id - Get coupon by ID (admin only)
router.get('/coupons/:id', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const coupon = await prisma.coupon.findUnique({
      where: { id },
    });

    if (!coupon) {
      return res.status(404).json({
        status: 'error',
        message: 'Coupon not found',
      });
    }

    res.json({
      status: 'success',
      data: coupon,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/coupons/validate - Validate a coupon code (public; advisory).
// The business rules live in coupon.service, which order placement ALSO
// calls at order time - so the discount the customer saw is the discount
// the order gets, and a code that stops being valid cannot be replayed.
// authz-ok: checkout validates a code before the customer logs in
router.post('/coupons/validate', optionalAuth, async (req, res, next) => {
  try {
    const { code, subtotal } = req.body;

    if (!code) {
      return res.status(400).json({
        status: 'error',
        message: 'Coupon code is required',
      });
    }

    try {
      // optionalAuth populates req.user when a token is present, so a
      // signed-in shopper gets their own per-customer limits applied at
      // preview time rather than being surprised at checkout.
      const result = await validateCoupon({
        code,
        subtotal: Number(subtotal || 0),
        userId: (req as any).user?.id,
      });
      const coupon = await prisma.coupon.findUnique({ where: { id: result.coupon.id } });
      res.json({
        status: 'success',
        data: {
          valid: true,
          coupon,
          discount: result.discount,
        },
      });
    } catch (err) {
      if (err instanceof CouponValidationError) {
        return res.json({
          status: 'success',
          data: { valid: false, error: err.message },
        });
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

// POST /api/coupons - Create coupon (admin only)
router.post('/coupons', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const {
      code,
      type,
      value,
      minOrderAmount,
      maxDiscountAmount,
      usageLimit,
      perCustomerLimit,
      newCustomersOnly,
      startsAt,
      expiresAt,
      isActive,
    } = req.body;

    // Validate required fields
    if (!code || !type) {
      return res.status(400).json({
        status: 'error',
        message: 'Code and type are required',
      });
    }
    if (typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({ status: 'error', message: 'Code is required' });
    }
    if (typeof type !== 'string' || !COUPON_TYPES.has(type)) {
      return res.status(400).json({
        status: 'error',
        message: 'Type must be one of: percentage, fixed, free_shipping',
      });
    }

    // Check if code already exists
    const existingCoupon = await prisma.coupon.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (existingCoupon) {
      return res.status(400).json({
        status: 'error',
        message: 'Coupon code already exists',
      });
    }

    // Create coupon — amounts/dates/limits are strictly validated (see the
    // helpers above): parseFloat used to accept Infinity and NaN, storing
    // coupons that broke every checkout or silently did nothing.
    const coupon = await prisma.coupon.create({
      data: {
        code: code.toUpperCase(),
        type,
        value: couponNumber(value, 0) ?? 0,
        minOrderAmount: couponNumber(minOrderAmount),
        maxDiscountAmount: couponNumber(maxDiscountAmount),
        usageLimit: couponUsageLimit(usageLimit),
        // Per-customer cap: null means unlimited, which is the behaviour
        // every pre-existing coupon had.
        perCustomerLimit: couponUsageLimit(perCustomerLimit),
        newCustomersOnly: Boolean(newCustomersOnly),
        startsAt: couponDate(startsAt),
        expiresAt: couponDate(expiresAt),
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      },
    });

    logger.info(`Coupon created: ${coupon.code}`);

    res.status(201).json({
      status: 'success',
      data: coupon,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/coupons/:id - Update coupon (admin only)
router.put('/coupons/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      code,
      type,
      value,
      minOrderAmount,
      maxDiscountAmount,
      usageLimit,
      perCustomerLimit,
      newCustomersOnly,
      startsAt,
      expiresAt,
      isActive,
    } = req.body;

    // Check if coupon exists
    const existingCoupon = await prisma.coupon.findUnique({
      where: { id },
    });

    if (!existingCoupon) {
      return res.status(404).json({
        status: 'error',
        message: 'Coupon not found',
      });
    }

    // Check if new code already exists (if changing code)
    if (code && code.toUpperCase() !== existingCoupon.code) {
      const codeExists = await prisma.coupon.findUnique({
        where: { code: code.toUpperCase() },
      });

      if (codeExists) {
        return res.status(400).json({
          status: 'error',
          message: 'Coupon code already exists',
        });
      }
    }

    if (type !== undefined && (typeof type !== 'string' || !COUPON_TYPES.has(type))) {
      return res.status(400).json({
        status: 'error',
        message: 'Type must be one of: percentage, fixed, free_shipping',
      });
    }

    // Update coupon — same strict coercion as create.
    const coupon = await prisma.coupon.update({
      where: { id },
      data: {
        code: code ? String(code).toUpperCase() : undefined,
        type: type || undefined,
        value: value !== undefined ? (couponNumber(value, 0) ?? 0) : undefined,
        minOrderAmount: minOrderAmount !== undefined ? couponNumber(minOrderAmount) : undefined,
        maxDiscountAmount: maxDiscountAmount !== undefined ? couponNumber(maxDiscountAmount) : undefined,
        usageLimit: usageLimit !== undefined ? couponUsageLimit(usageLimit) : undefined,
        perCustomerLimit: perCustomerLimit !== undefined ? couponUsageLimit(perCustomerLimit) : undefined,
        newCustomersOnly: newCustomersOnly !== undefined ? Boolean(newCustomersOnly) : undefined,
        startsAt: startsAt !== undefined ? couponDate(startsAt) : undefined,
        expiresAt: expiresAt !== undefined ? couponDate(expiresAt) : undefined,
        isActive: isActive !== undefined ? Boolean(isActive) : undefined,
      },
    });

    logger.info(`Coupon updated: ${coupon.code}`);

    res.json({
      status: 'success',
      data: coupon,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/coupons/:id - Delete coupon (admin only)
router.delete('/coupons/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const coupon = await prisma.coupon.findUnique({
      where: { id },
    });

    if (!coupon) {
      return res.status(404).json({
        status: 'error',
        message: 'Coupon not found',
      });
    }

    await prisma.coupon.delete({
      where: { id },
    });

    logger.info(`Coupon deleted: ${coupon.code}`);

    res.json({
      status: 'success',
      message: 'Coupon deleted successfully',
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/coupons/:id/apply - Apply coupon to order (used internally)
export default router;