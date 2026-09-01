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
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { validateCoupon, CouponValidationError } from './coupon.service';

const router = Router();

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
router.post('/coupons/validate', async (req, res, next) => {
  try {
    const { code, subtotal } = req.body;

    if (!code) {
      return res.status(400).json({
        status: 'error',
        message: 'Coupon code is required',
      });
    }

    try {
      const result = await validateCoupon({ code, subtotal: Number(subtotal || 0) });
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

    // Create coupon
    const coupon = await prisma.coupon.create({
      data: {
        code: code.toUpperCase(),
        type,
        value: parseFloat(value) || 0,
        minOrderAmount: minOrderAmount ? parseFloat(minOrderAmount) : null,
        maxDiscountAmount: maxDiscountAmount ? parseFloat(maxDiscountAmount) : null,
        usageLimit: usageLimit ? parseInt(usageLimit) : null,
        startsAt: startsAt ? new Date(startsAt) : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive: isActive !== undefined ? isActive : true,
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

    // Update coupon
    const coupon = await prisma.coupon.update({
      where: { id },
      data: {
        code: code ? code.toUpperCase() : undefined,
        type: type || undefined,
        value: value !== undefined ? parseFloat(value) : undefined,
        minOrderAmount: minOrderAmount !== undefined ? (minOrderAmount ? parseFloat(minOrderAmount) : null) : undefined,
        maxDiscountAmount: maxDiscountAmount !== undefined ? (maxDiscountAmount ? parseFloat(maxDiscountAmount) : null) : undefined,
        usageLimit: usageLimit !== undefined ? (usageLimit ? parseInt(usageLimit) : null) : undefined,
        startsAt: startsAt !== undefined ? (startsAt ? new Date(startsAt) : null) : undefined,
        expiresAt: expiresAt !== undefined ? (expiresAt ? new Date(expiresAt) : null) : undefined,
        isActive: isActive !== undefined ? isActive : undefined,
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