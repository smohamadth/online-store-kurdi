import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { z } from 'zod';

const router = Router();

// Validation schemas
const adjustStockSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  quantityChange: z.number().int(),
  reason: z.enum(['sale', 'return', 'adjustment', 'restock', 'damaged', 'transfer']),
  notes: z.string().optional(),
});

const bulkUpdateSchema = z.object({
  updates: z.array(z.object({
    productId: z.string().uuid(),
    variantId: z.string().uuid().optional(),
    quantity: z.number().int().min(0),
  })),
});

const stockAlertSchema = z.object({
  productId: z.string().uuid(),
  lowStockThreshold: z.number().int().min(0).optional(),
  outOfStockThreshold: z.number().int().min(0).optional(),
  notifyEmail: z.string().email().optional(),
  isActive: z.boolean().optional(),
});

// GET /api/inventory - Get inventory overview
router.get('/', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;
    const status = req.query.status as string; // 'in_stock', 'low_stock', 'out_of_stock'

    // Build filter
    const where: any = { status: 'active' };
    
    if (status === 'in_stock') {
      where.quantity = { gt: 10 };
    } else if (status === 'low_stock') {
      where.quantity = { gt: 0, lte: 10 };
    } else if (status === 'out_of_stock') {
      where.quantity = 0;
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        select: {
          id: true,
          name: true,
          sku: true,
          quantity: true,
          lowStockThreshold: true,
          trackInventory: true,
          variants: {
            select: {
              id: true,
              name: true,
              sku: true,
              quantity: true,
            },
          },
          category: {
            select: { name: true },
          },
        },
        skip,
        take: limit,
        orderBy: { quantity: 'asc' },
      }),
      prisma.product.count({ where }),
    ]);

    // Get summary stats
    const [totalProducts, lowStockCount, outOfStockCount] = await Promise.all([
      prisma.product.count({ where: { status: 'active' } }),
      prisma.product.count({
        where: {
          status: 'active',
          quantity: { gt: 0, lte: 10 },
        },
      }),
      prisma.product.count({
        where: {
          status: 'active',
          quantity: 0,
        },
      }),
    ]);

    res.json({
      status: 'success',
      data: products,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      summary: {
        totalProducts,
        lowStockCount,
        outOfStockCount,
        inStockCount: totalProducts - lowStockCount - outOfStockCount,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/inventory/adjust - Adjust stock
router.post('/adjust', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const validatedData = adjustStockSchema.parse(req.body);
    const { productId, variantId, quantityChange, reason, notes } = validatedData;

    // Get current quantity
    let currentQuantity: number;
    if (variantId) {
      const variant = await prisma.productVariant.findUnique({
        where: { id: variantId },
        select: { quantity: true },
      });
      if (!variant) {
        return res.status(404).json({ status: 'error', message: 'Variant not found' });
      }
      currentQuantity = variant.quantity;
    } else {
      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { quantity: true },
      });
      if (!product) {
        return res.status(404).json({ status: 'error', message: 'Product not found' });
      }
      currentQuantity = product.quantity;
    }

    const newQuantity = currentQuantity + quantityChange;

    if (newQuantity < 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Insufficient stock',
        currentQuantity,
        requestedChange: quantityChange,
      });
    }

    // Update quantity
    if (variantId) {
      await prisma.productVariant.update({
        where: { id: variantId },
        data: { quantity: newQuantity },
      });
    } else {
      await prisma.product.update({
        where: { id: productId },
        data: { quantity: newQuantity },
      });
    }

    // Log inventory change
    await prisma.inventoryLog.create({
      data: {
        productId,
        variantId,
        quantityChange,
        previousQuantity: currentQuantity,
        newQuantity,
        reason,
        notes,
        createdBy: req.user?.id,
      },
    });

    logger.info(`Inventory adjusted: ${productId} ${quantityChange > 0 ? '+' : ''}${quantityChange} (${reason})`);

    res.json({
      status: 'success',
      data: {
        productId,
        variantId,
        previousQuantity: currentQuantity,
        newQuantity,
        quantityChange,
        reason,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/inventory/bulk-update - Bulk update stock
router.post('/bulk-update', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const validatedData = bulkUpdateSchema.parse(req.body);
    const results = { success: 0, failed: 0, errors: [] as any[] };

    for (const update of validatedData.updates) {
      try {
        if (update.variantId) {
          await prisma.productVariant.update({
            where: { id: update.variantId },
            data: { quantity: update.quantity },
          });
        } else {
          await prisma.product.update({
            where: { id: update.productId },
            data: { quantity: update.quantity },
          });
        }
        results.success++;
      } catch (err: any) {
        results.failed++;
        results.errors.push({
          productId: update.productId,
          error: err.message,
        });
      }
    }

    logger.info(`Bulk stock update: ${results.success} success, ${results.failed} failed`);

    res.json({
      status: 'success',
      data: results,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/logs - Get inventory logs
router.get('/logs', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;
    const productId = req.query.productId as string;
    const reason = req.query.reason as string;

    const where: any = {};
    if (productId) where.productId = productId;
    if (reason) where.reason = reason;

    const [logs, total] = await Promise.all([
      prisma.inventoryLog.findMany({
        where,
        include: {
          product: {
            select: { name: true, sku: true },
          },
          variant: {
            select: { name: true, sku: true },
          },
          creator: {
            select: { firstName: true, lastName: true },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.inventoryLog.count({ where }),
    ]);

    res.json({
      status: 'success',
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/alerts - Get stock alerts
router.get('/alerts', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const alerts = await prisma.stockAlert.findMany({
      where: { isActive: true },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            quantity: true,
            lowStockThreshold: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      status: 'success',
      data: alerts,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/inventory/alerts - Create/update stock alert
router.post('/alerts', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const validatedData = stockAlertSchema.parse(req.body);

    const alert = await prisma.stockAlert.upsert({
      where: { productId: validatedData.productId },
      update: {
        lowStockThreshold: validatedData.lowStockThreshold,
        outOfStockThreshold: validatedData.outOfStockThreshold,
        notifyEmail: validatedData.notifyEmail,
        isActive: validatedData.isActive,
      },
      create: validatedData,
    });

    res.json({
      status: 'success',
      data: alert,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/low-stock - Get low stock products
router.get('/low-stock', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const threshold = parseInt(req.query.threshold as string) || 10;

    const products = await prisma.product.findMany({
      where: {
        status: 'active',
        trackInventory: true,
        quantity: {
          gt: 0,
          lte: threshold,
        },
      },
      select: {
        id: true,
        name: true,
        sku: true,
        quantity: true,
        lowStockThreshold: true,
        category: {
          select: { name: true },
        },
      },
      orderBy: { quantity: 'asc' },
    });

    res.json({
      status: 'success',
      data: products,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/out-of-stock - Get out of stock products
router.get('/out-of-stock', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: {
        status: 'active',
        trackInventory: true,
        quantity: 0,
      },
      select: {
        id: true,
        name: true,
        sku: true,
        category: {
          select: { name: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.json({
      status: 'success',
      data: products,
    });
  } catch (err) {
    next(err);
  }
});

export default router;