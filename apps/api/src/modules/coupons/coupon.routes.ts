// ---------------------------------------------------------------------------
// Coupons: admin CRUD + the public "validate this code" endpoint the
// checkout calls.
//
// Validation (POST /coupons/validate) is where the business rules live:
// active flag, start/end dates, min-spend, and per-customer usage limits
// (maxUses / maxUsesPerCustomer). It returns the computed discount so
// the client renders the savings before placing the order; at order time
// the client sends the couponId and the server increments usedCount
// (in order.routes). The store has no re-validation of the code at
// order time - the discountAmount is trusted from the client, so treat
// validate as the enforcement point.
// ---------------------------------------------------------------------------
import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';

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

// POST /api/coupons/validate - Validate a coupon code (public)
router.post('/coupons/validate', async (req, res, next) => {
  try {
    const { code, subtotal } = req.body;

    if (!code) {
      return res.status(400).json({
        status: 'error',
        message: 'Coupon code is required',
      });
    }

    // Find coupon
    const coupon = await prisma.coupon.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!coupon) {
      return res.json({
        status: 'success',
        data: { valid: false, error: 'Invalid coupon code' },
      });
    }

    // Check if active
    if (!coupon.isActive) {
      return res.json({
        status: 'success',
        data: { valid: false, error: 'This coupon is no longer active' },
      });
    }

    // Check expiry
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
      return res.json({
        status: 'success',
        data: { valid: false, error: 'This coupon has expired' },
      });
    }

    // Check start date
    if (coupon.startsAt && new Date(coupon.startsAt) > new Date()) {
      return res.json({
        status: 'success',
        data: { valid: false, error: 'This coupon is not yet active' },
      });
    }

    // Check usage limit
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return res.json({
        status: 'success',
        data: { valid: false, error: 'This coupon has reached its usage limit' },
      });
    }

    // Check minimum order amount
    if (coupon.minOrderAmount && subtotal < Number(coupon.minOrderAmount)) {
      return res.json({
        status: 'success',
        data: {
          valid: false,
          error: `Minimum order amount is $${Number(coupon.minOrderAmount).toFixed(2)}`,
        },
      });
    }

    // Calculate discount
    let discount = 0;
    const orderAmount = subtotal || 0;

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
        discount = 0; // Handled separately
        break;
    }

    // Never discount more than the order is worth.
    //
    // A fixed 50 coupon against a 10 subtotal returned a discount of 50, which
    // produces a NEGATIVE order total - i.e. the store paying the customer.
    // Percentage coupons were already bounded by the subtotal, but a fixed
    // amount had no cap at all. Clamped here, at the single place the discount
    // is computed.
    discount = Math.max(0, Math.min(discount, orderAmount));

    res.json({
      status: 'success',
      data: {
        valid: true,
        coupon,
        discount: Math.round(discount * 100) / 100,
      },
    });
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
router.post('/coupons/:id/apply', authenticate, async (req, res, next) => {
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

    // Increment usage count
    await prisma.coupon.update({
      where: { id },
      data: {
        usedCount: {
          increment: 1,
        },
      },
    });

    logger.info(`Coupon applied: ${coupon.code}`);

    res.json({
      status: 'success',
      message: 'Coupon applied successfully',
    });
  } catch (err) {
    next(err);
  }
});

export default router;