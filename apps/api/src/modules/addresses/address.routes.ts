import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { z } from 'zod';

const router = Router();

// Validation schema
const addressSchema = z.object({
  type: z.enum(['shipping', 'billing']).default('shipping'),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  company: z.string().max(100).optional().nullable(),
  address1: z.string().min(1).max(255),
  address2: z.string().max(255).optional().nullable(),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  postalCode: z.string().min(1).max(20),
  country: z.string().min(2).max(2).default('US'),
  phone: z.string().max(20).optional().nullable(),
  isDefault: z.boolean().optional(),
});

// GET /api/addresses - Get user's addresses
router.get('/', authenticate, async (req, res, next) => {
  try {
    const addresses = await prisma.address.findMany({
      where: { userId: req.user!.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    res.json({
      status: 'success',
      data: addresses,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/addresses - Create address
router.post('/', authenticate, async (req, res, next) => {
  try {
    const data = addressSchema.parse(req.body);

    // If setting as default, unset other defaults
    if (data.isDefault) {
      await prisma.address.updateMany({
        where: { userId: req.user!.id, type: data.type },
        data: { isDefault: false },
      });
    }

    // If first address, make it default
    const addressCount = await prisma.address.count({
      where: { userId: req.user!.id, type: data.type },
    });

    const address = await prisma.address.create({
      data: {
        ...data,
        userId: req.user!.id,
        isDefault: data.isDefault || addressCount === 0,
      },
    });

    logger.info(`Address created for user ${req.user!.email}`);

    res.status(201).json({
      status: 'success',
      data: address,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/addresses/:id - Update address
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = addressSchema.partial().parse(req.body);

    // Verify address belongs to user
    const existing = await prisma.address.findFirst({
      where: { id, userId: req.user!.id },
    });

    if (!existing) {
      return res.status(404).json({
        status: 'error',
        message: 'Address not found',
      });
    }

    // If setting as default, unset other defaults
    if (data.isDefault) {
      await prisma.address.updateMany({
        where: { userId: req.user!.id, type: existing.type, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const address = await prisma.address.update({
      where: { id },
      data,
    });

    res.json({
      status: 'success',
      data: address,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/addresses/:id - Delete address
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verify address belongs to user
    const existing = await prisma.address.findFirst({
      where: { id, userId: req.user!.id },
    });

    if (!existing) {
      return res.status(404).json({
        status: 'error',
        message: 'Address not found',
      });
    }

    await prisma.address.delete({ where: { id } });

    // If deleted address was default, set another as default
    if (existing.isDefault) {
      const nextAddress = await prisma.address.findFirst({
        where: { userId: req.user!.id, type: existing.type },
        orderBy: { createdAt: 'desc' },
      });

      if (nextAddress) {
        await prisma.address.update({
          where: { id: nextAddress.id },
          data: { isDefault: true },
        });
      }
    }

    res.json({
      status: 'success',
      message: 'Address deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/addresses/:id/default - Set as default
router.put('/:id/default', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await prisma.address.findFirst({
      where: { id, userId: req.user!.id },
    });

    if (!existing) {
      return res.status(404).json({
        status: 'error',
        message: 'Address not found',
      });
    }

    // Unset other defaults of same type
    await prisma.address.updateMany({
      where: { userId: req.user!.id, type: existing.type },
      data: { isDefault: false },
    });

    // Set this as default
    const address = await prisma.address.update({
      where: { id },
      data: { isDefault: true },
    });

    res.json({
      status: 'success',
      data: address,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
