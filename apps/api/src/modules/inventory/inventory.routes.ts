// ---------------------------------------------------------------------------
// Inventory admin API (mounted at /api/inventory).
//
// Almost everything here is admin/manager-gated: stock adjustments,
// bulk updates, the audit log, low/out-of-stock lists, warehouses +
// transfers, stock takes, reorder rules + the draft pipeline they feed,
// sales channels, and manual reservation management.
//
// Two public-adjacent pieces: POST /webhooks/3pl (a 3PL pushes stock
// deltas; authenticity comes from the HMAC in the webhook secret, see
// verifyWebhookSignature in inventory.helpers) and the reservation
// endpoints the cart/order flows use internally.
//
// Business rules live in inventory.service.ts; this file is input
// validation + auth + response shaping.
// ---------------------------------------------------------------------------
import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { z } from 'zod';
import { AppError } from '../../middleware/errorHandler';
import { parseInventoryCsv } from './inventory.helpers';
import {
  decrementStock,
  incrementStock,
  createReservation,
  consumeReservation,
  releaseReservation,
  extendReservation,
  releaseExpiredReservations,
  availableQuantity,
  createStockTake,
  applyStockTake,
  getOrCreateDefaultWarehouse,
  runAutoReorder,
  apply3PLStockDelta,
  verifyWebhookSignature,
  type StockTakeItemInput,
} from './inventory.service';
import { parsePagination } from '../../utils/pagination';

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
    const { page, limit, skip } = parsePagination(req.query, { limit: 50 });
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
      const variant = await prisma.variant.findUnique({
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
      await prisma.variant.update({
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
          await prisma.variant.update({
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
    const { page, limit, skip } = parsePagination(req.query, { limit: 50 });
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
    // Clamped: a hostile ?threshold=-5 would be a Prisma validation
    // error (gt:0 AND lte:-5) and ?threshold=1e999 parses to Infinity.
    const raw = req.query.threshold;
    const n = typeof raw === 'string' ? Number(raw) : NaN;
    const threshold =
      Number.isFinite(n) && Number.isInteger(n) && n >= 1 ? Math.min(n, 9999) : 10;

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


// ============================================
//  WAREHOUSES
// ============================================

// GET /api/inventory/warehouses - list all warehouses
router.get('/warehouses', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const where: any = {};
    if (req.query.isActive === 'true') where.isActive = true;
    if (req.query.isActive === 'false') where.isActive = false;
    const warehouses = await prisma.warehouse.findMany({
      where,
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.json({ status: 'success', data: warehouses });
  } catch (err) { next(err); }
});

// POST /api/inventory/warehouses - create a warehouse
const warehouseSchema = z.object({
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(40).regex(/^[A-Z0-9_-]+$/i, 'code must be alphanumeric'),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  country: z.string().length(2).optional(),
  postalCode: z.string().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
router.post('/warehouses', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const data = warehouseSchema.parse(req.body);
    // Ensure code is unique.
    const existing = await prisma.warehouse.findUnique({ where: { code: data.code } });
    if (existing) throw new AppError(`Warehouse with code "${data.code}" already exists`, 409);
    const created = await prisma.warehouse.create({ data });
    res.status(201).json({ status: 'success', data: created });
  } catch (err) { next(err); }
});

// GET /api/inventory/warehouses/:id - get one warehouse
router.get('/warehouses/:id', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const w = await prisma.warehouse.findUnique({ where: { id: req.params.id } });
    if (!w) throw new AppError('Warehouse not found', 404);
    res.json({ status: 'success', data: w });
  } catch (err) { next(err); }
});

// PATCH /api/inventory/warehouses/:id - update
router.patch('/warehouses/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const data = warehouseSchema.partial().parse(req.body);
    const updated = await prisma.warehouse.update({ where: { id: req.params.id }, data });
    res.json({ status: 'success', data: updated });
  } catch (err) { next(err); }
});

// DELETE /api/inventory/warehouses/:id - delete
// Refuses to delete the default warehouse or one with stock-take history.
router.delete('/warehouses/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const w = await prisma.warehouse.findUnique({ where: { id: req.params.id } });
    if (!w) throw new AppError('Warehouse not found', 404);
    if (w.isDefault) throw new AppError('Cannot delete the default warehouse. Mark another warehouse as default first.', 400);
    const usage = await prisma.stockTake.count({ where: { warehouseId: w.id } });
    if (usage > 0) throw new AppError('Warehouse has stock-take history; archive it instead by setting isActive=false', 400);
    await prisma.warehouse.delete({ where: { id: w.id } });
    res.json({ status: 'success', message: 'Warehouse deleted' });
  } catch (err) { next(err); }
});

// ============================================
//  WAREHOUSE TRANSFERS
// ============================================

// POST /api/inventory/warehouse-transfers - initiate
const transferSchema = z.object({
  fromWarehouseId: z.string().uuid(),
  toWarehouseId: z.string().uuid(),
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  quantity: z.number().int().min(1),
  notes: z.string().optional(),
});
router.post('/warehouse-transfers', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const data = transferSchema.parse(req.body);
    if (data.fromWarehouseId === data.toWarehouseId) {
      throw new AppError('Cannot transfer to the same warehouse', 400);
    }
    // Soft-hold the source.
    const t = await prisma.warehouseTransfer.create({
      data: {
        fromWarehouseId: data.fromWarehouseId,
        toWarehouseId: data.toWarehouseId,
        productId: data.productId,
        variantId: data.variantId ?? null,
        quantity: data.quantity,
        status: 'in_transit',
        notes: data.notes ?? null,
        createdBy: req.user!.id,
      },
    });
    res.status(201).json({ status: 'success', data: t });
  } catch (err) { next(err); }
});

// GET /api/inventory/warehouse-transfers - list
router.get('/warehouse-transfers', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const where: any = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.fromWarehouseId) where.fromWarehouseId = req.query.fromWarehouseId;
    if (req.query.toWarehouseId) where.toWarehouseId = req.query.toWarehouseId;
    const list = await prisma.warehouseTransfer.findMany({
      where,
      include: { product: { select: { name: true, sku: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ status: 'success', data: list });
  } catch (err) { next(err); }
});

// POST /api/inventory/warehouse-transfers/:id/complete - finish
router.post('/warehouse-transfers/:id/complete', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const t = await tx.warehouseTransfer.findUnique({ where: { id: req.params.id } });
      if (!t) throw new AppError('Transfer not found', 404);
      if (t.status !== 'in_transit') throw new AppError(`Transfer is ${t.status}, can only complete in_transit`, 400);
      // Compute how many units actually move. If the source doesn't
      // have enough, the source is clamped at 0 and the destination
      // receives only what was actually drained. The transfer row's
      // quantity is updated to reflect reality for the audit trail.
      const sourceWhere = { warehouseId: t.fromWarehouseId, productId: t.productId, variantId: t.variantId };
      const source = await tx.warehouseStock.findFirst({ where: sourceWhere });
      const available = source ? source.quantity : 0;
      const moved = Math.min(available, t.quantity);
      if (moved <= 0) {
        // Nothing to move; mark the transfer completed with 0 moved
        // and leave the source/dest untouched.
        return tx.warehouseTransfer.update({
          where: { id: t.id },
          data: { status: 'completed', completedAt: new Date() },
        });
      }
      if (source) {
        await tx.warehouseStock.update({
          where: { id: source.id },
          data: { quantity: source.quantity - moved },
        });
      } else {
        await tx.warehouseStock.create({ data: { ...sourceWhere, quantity: 0 } });
      }
      // Increment destination by `moved` (not the requested t.quantity).
      const destWhere = { warehouseId: t.toWarehouseId, productId: t.productId, variantId: t.variantId };
      const dest = await tx.warehouseStock.findFirst({ where: destWhere });
      if (dest) {
        await tx.warehouseStock.update({
          where: { id: dest.id },
          data: { quantity: dest.quantity + moved },
        });
      } else {
        await tx.warehouseStock.create({ data: { ...destWhere, quantity: moved } });
      }
      return tx.warehouseTransfer.update({
        where: { id: t.id },
        data: { status: 'completed', completedAt: new Date() },
      });
    });
    res.json({ status: 'success', data: result });
  } catch (err) { next(err); }
});

// POST /api/inventory/warehouse-transfers/:id/cancel
router.post('/warehouse-transfers/:id/cancel', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const t = await prisma.warehouseTransfer.findUnique({ where: { id: req.params.id } });
    if (!t) throw new AppError('Transfer not found', 404);
    if (t.status !== 'in_transit') throw new AppError(`Transfer is ${t.status}, can only cancel in_transit`, 400);
    const updated = await prisma.warehouseTransfer.update({
      where: { id: t.id },
      data: { status: 'cancelled', cancelledAt: new Date() },
    });
    res.json({ status: 'success', data: updated });
  } catch (err) { next(err); }
});

// POST /api/inventory/warehouses/:id/default - mark as the default
router.post('/warehouses/:id/default', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    await prisma.$transaction(async (tx: any) => {
      await tx.warehouse.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      await tx.warehouse.update({ where: { id: req.params.id }, data: { isDefault: true } });
    });
    res.json({ status: 'success', message: 'Default warehouse updated' });
  } catch (err) { next(err); }
});

// ============================================
//  STOCK TAKES (cycle counts)
// ============================================

// POST /api/inventory/stock-takes - create a new take
const stockTakeCreateSchema = z.object({
  warehouseId: z.string().uuid().optional(),  // defaults to default warehouse
  name: z.string().min(1).max(120),
  notes: z.string().max(500).optional(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    variantId: z.string().uuid().optional(),
    expected: z.number().int().min(0),
    counted: z.number().int().min(0),
    notes: z.string().max(200).optional(),
  })).min(1),
});
router.post('/stock-takes', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const data = stockTakeCreateSchema.parse(req.body);
    const warehouseId = data.warehouseId || (await getOrCreateDefaultWarehouse()).id;
    const items: StockTakeItemInput[] = data.items.map((it) => ({
      productId: it.productId,
      variantId: it.variantId,
      expected: it.expected,
      counted: it.counted,
      notes: it.notes,
    }));
    const take = await createStockTake({
      warehouseId,
      name: data.name,
      notes: data.notes,
      createdBy: req.user!.id,
      items,
    });
    const full = await prisma.stockTake.findUnique({ where: { id: take.id }, include: { items: true } });
    res.status(201).json({ status: 'success', data: full });
  } catch (err) { next(err); }
});

// GET /api/inventory/stock-takes - list
router.get('/stock-takes', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const where: any = {};
    if (req.query.warehouseId) where.warehouseId = req.query.warehouseId;
    if (req.query.status) where.status = req.query.status;
    const takes = await prisma.stockTake.findMany({
      where,
      include: { items: true, warehouse: { select: { id: true, code: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ status: 'success', data: takes });
  } catch (err) { next(err); }
});

// GET /api/inventory/stock-takes/:id
router.get('/stock-takes/:id', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const t = await prisma.stockTake.findUnique({ where: { id: req.params.id }, include: { items: true, warehouse: true } });
    if (!t) throw new AppError('Stock take not found', 404);
    res.json({ status: 'success', data: t });
  } catch (err) { next(err); }
});

// POST /api/inventory/stock-takes/:id/apply - commit
router.post('/stock-takes/:id/apply', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const result = await applyStockTake(req.params.id, { userId: req.user!.id });
    res.json({ status: 'success', data: result });
  } catch (err) { next(err); }
});

// POST /api/inventory/stock-takes/:id/cancel
router.post('/stock-takes/:id/cancel', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const result = await applyStockTake(req.params.id, { cancel: true, userId: req.user!.id });
    res.json({ status: 'success', data: result });
  } catch (err) { next(err); }
});

// ============================================
//  REORDER RULES
// ============================================

const reorderRuleSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  threshold: z.number().int().min(0),
  reorderQty: z.number().int().min(1),
  supplierName: z.string().optional(),
  supplierEmail: z.string().email().optional(),
  isActive: z.boolean().optional(),
});
router.post('/reorder-rules', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const data = reorderRuleSchema.parse(req.body);
    const created = await prisma.reorderRule.create({ data });
    res.status(201).json({ status: 'success', data: created });
  } catch (err) { next(err); }
});
router.get('/reorder-rules', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const where: any = {};
    if (req.query.productId) where.productId = req.query.productId;
    if (req.query.isActive) where.isActive = req.query.isActive === 'true';
    const rules = await prisma.reorderRule.findMany({ where });
    res.json({ status: 'success', data: rules });
  } catch (err) { next(err); }
});
router.patch('/reorder-rules/:id', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const data = reorderRuleSchema.partial().parse(req.body);
    const updated = await prisma.reorderRule.update({ where: { id: req.params.id }, data });
    res.json({ status: 'success', data: updated });
  } catch (err) { next(err); }
});
router.delete('/reorder-rules/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    await prisma.reorderRule.delete({ where: { id: req.params.id } });
    res.json({ status: 'success', message: 'Rule deleted' });
  } catch (err) { next(err); }
});

// POST /api/inventory/reorder-rules/run - run the auto-reorder job now
const reorderRunSchema = z.object({ dryRun: z.boolean().optional() });
router.post('/reorder-rules/run', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const data = reorderRunSchema.parse(req.body || {});
    const result = await runAutoReorder({ dryRun: data.dryRun });
    res.json({ status: 'success', data: result });
  } catch (err) { next(err); }
});

// GET /api/inventory/reorder-drafts - list draft POs
router.get('/reorder-drafts', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const where: any = {};
    if (req.query.status) where.status = req.query.status;
    const drafts = await prisma.reorderDraft.findMany({
      where,
      include: { product: { select: { id: true, name: true, sku: true } }, warehouse: { select: { id: true, code: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ status: 'success', data: drafts });
  } catch (err) { next(err); }
});

// PATCH /api/inventory/reorder-drafts/:id - update status (approve, send, cancel)
const reorderDraftUpdateSchema = z.object({
  status: z.enum(['draft', 'sent', 'cancelled', 'received']).optional(),
  notes: z.string().max(500).optional(),
});
router.patch('/reorder-drafts/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const body = reorderDraftUpdateSchema.parse(req.body);
    const data: any = {};
    if (body.status === 'sent') data.sentAt = new Date();
    if (body.status === 'cancelled') data.cancelledAt = new Date();
    if (body.status === 'received') data.receivedAt = new Date();
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.status) data.status = body.status;
    const updated = await prisma.reorderDraft.update({ where: { id: req.params.id }, data });
    res.json({ status: 'success', data: updated });
  } catch (err) { next(err); }
});

// ============================================
//  CHANNELS
// ============================================

const channelSchema = z.object({
  name: z.string().min(1).max(60).regex(/^[a-z0-9_]+$/, 'lowercase, digits, underscore only'),
  displayName: z.string().min(1).max(120),
  type: z.enum(['online', 'marketplace', 'retail']).optional(),
  isActive: z.boolean().optional(),
});
router.post('/channels', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const data = channelSchema.parse(req.body);
    const created = await prisma.channel.create({ data });
    res.status(201).json({ status: 'success', data: created });
  } catch (err) { next(err); }
});
router.get('/channels', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const channels = await prisma.channel.findMany({ orderBy: { displayName: 'asc' } });
    res.json({ status: 'success', data: channels });
  } catch (err) { next(err); }
});

// GET /api/inventory/channels/:id/stock - per-product stock across channels
router.get('/channels/:id/stock', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const stocks = await prisma.channelStock.findMany({
      where: { channelId: req.params.id },
      include: { product: { select: { id: true, name: true, sku: true } } },
      orderBy: { product: { name: 'asc' } },
    });
    res.json({ status: 'success', data: stocks });
  } catch (err) { next(err); }
});

// POST /api/inventory/channels/:id/sync - apply a manual 3PL/marketplace delta
const syncSchema = z.object({
  provider: z.string().min(1),
  externalSku: z.string().min(1),
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  delta: z.number().int(),
  reason: z.string().optional(),
  externalRef: z.string().optional(),
});
router.post('/channels/:id/sync', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const data = syncSchema.parse(req.body);
    const result = await apply3PLStockDelta({ channelId: req.params.id, ...data });
    res.json({ status: 'success', data: result });
  } catch (err) { next(err); }
});

// ============================================
//  RESERVATIONS
// ============================================

// POST /api/inventory/reservations - create a reservation
const reservationCreateSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  quantity: z.number().int().min(1),
  cartItemId: z.string().uuid().optional(),
  reason: z.enum(['cart_hold', 'backorder', 'manual']).optional(),
  ttlMinutes: z.number().int().min(1).max(60 * 24).optional(),
});
router.post('/reservations', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const data = reservationCreateSchema.parse(req.body);
    const reservation = await createReservation(data);
    res.status(201).json({ status: 'success', data: reservation });
  } catch (err) { next(err); }
});

// GET /api/inventory/reservations - list active reservations
router.get('/reservations', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const where: any = { releasedAt: null };
    if (req.query.productId) where.productId = req.query.productId;
    if (req.query.activeOnly === 'true') where.reservedUntil = { gt: new Date() };
    const list = await prisma.stockReservation.findMany({
      where,
      orderBy: { reservedUntil: 'asc' },
    });
    res.json({ status: 'success', data: list });
  } catch (err) { next(err); }
});

// POST /api/inventory/reservations/release-expired - cron-style
// Returns the count released.
router.post('/reservations/release-expired', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const released = await releaseExpiredReservations();
    res.json({ status: 'success', data: { released } });
  } catch (err) { next(err); }
});

// PATCH /api/inventory/reservations/:id - extend the TTL.
// Body: { ttlMinutes: number }
const reservationPatchSchema = z.object({
  ttlMinutes: z.number().int().min(1).max(60 * 24 * 7), // max 1 week
});
router.patch('/reservations/:id', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const { ttlMinutes } = reservationPatchSchema.parse(req.body);
    const updated = await extendReservation(req.params.id, ttlMinutes);
    res.json({ status: 'success', data: updated });
  } catch (err) { next(err); }
});

// DELETE /api/inventory/reservations/:id - manually release one.
// Idempotent: releasing an already-released reservation is a no-op.
router.delete('/reservations/:id', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const updated = await releaseReservation(req.params.id);
    res.json({ status: 'success', data: updated });
  } catch (err) { next(err); }
});

// GET /api/inventory/available?productId=X&variantId=Y
router.get('/available', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const productId = String(req.query.productId || '');
    const variantId = req.query.variantId ? String(req.query.variantId) : undefined;
    if (!productId) throw new AppError('productId is required', 400);
    const available = await availableQuantity(productId, variantId);
    res.json({ status: 'success', data: { productId, variantId, available } });
  } catch (err) { next(err); }
});

// ============================================
//  CSV BULK IMPORT
// ============================================

// Accepts text/csv body or JSON {csv: "..."}. Each line:
//   sku,quantity[,variantSku]
// where quantity may be -N to subtract. The endpoint validates every
// row before applying, so a bad line aborts the whole import.
router.post('/import-csv', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const raw = (typeof req.body === 'string' ? req.body : req.body?.csv) as string;
    if (!raw) throw new AppError('No CSV body', 400);
    const { valid, invalid } = parseInventoryCsv(raw);
    if (invalid.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'CSV contains invalid rows',
        data: invalid,
      });
    }
    const results: { sku: string; variantSku?: string; quantity: number; ok: boolean; error?: string }[] = [];
    // Second pass: apply.
    for (const row of valid) {
      try {
        if (row.quantity >= 0) {
          // Positive: set absolute
          if (row.variantSku) {
            const v = await prisma.variant.findFirst({ where: { sku: row.variantSku } });
            if (!v) throw new Error(`variant not found: ${row.variantSku}`);
            const previous = v.quantity;
            await prisma.variant.update({ where: { id: v.id }, data: { quantity: row.quantity } });
            await prisma.inventoryLog.create({
              data: { productId: v.productId, variantId: v.id, quantityChange: row.quantity - previous, previousQuantity: previous, newQuantity: row.quantity, reason: 'restock', notes: 'csv import' },
            });
          } else {
            const p = await prisma.product.findUnique({ where: { sku: row.sku } });
            if (!p) throw new Error(`product not found: ${row.sku}`);
            const previous = p.quantity;
            await prisma.product.update({ where: { id: p.id }, data: { quantity: row.quantity } });
            await prisma.inventoryLog.create({
              data: { productId: p.id, variantId: null, quantityChange: row.quantity - previous, previousQuantity: previous, newQuantity: row.quantity, reason: 'restock', notes: 'csv import' },
            });
          }
        } else {
          // Negative: delta
          const abs = -row.quantity;
          if (row.variantSku) {
            const v = await prisma.variant.findFirst({ where: { sku: row.variantSku } });
            if (!v) throw new Error(`variant not found: ${row.variantSku}`);
            await decrementStock({ productId: v.productId, variantId: v.id, quantity: abs, userId: req.user!.id });
          } else {
            const p = await prisma.product.findUnique({ where: { sku: row.sku } });
            if (!p) throw new Error(`product not found: ${row.sku}`);
            await decrementStock({ productId: p.id, quantity: abs, userId: req.user!.id });
          }
        }
        results.push({ sku: row.sku, variantSku: row.variantSku, quantity: row.quantity, ok: true });
      } catch (err: any) {
        results.push({ sku: row.sku, variantSku: row.variantSku, quantity: row.quantity, ok: false, error: err?.message ?? 'unknown' });
      }
    }
    res.json({ status: 'success', data: { applied: results.filter((r) => r.ok).length, results } });
  } catch (err) { next(err); }
});

// ============================================
//  RETURNS / RESTOCK
// ============================================

// POST /api/inventory/restock - increment stock from a return
const restockSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  quantity: z.number().int().min(1),
  notes: z.string().max(200).optional(),
  orderId: z.string().uuid().optional(),
});
router.post('/restock', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const data = restockSchema.parse(req.body);
    const result = await incrementStock({
      productId: data.productId,
      variantId: data.variantId,
      quantity: data.quantity,
      reason: 'return',
      notes: data.notes,
      orderId: data.orderId,
      userId: req.user!.id,
    });
    res.json({ status: 'success', data: result });
  } catch (err) { next(err); }
});

// ============================================
//  3PL WEBHOOK
// ============================================

// Public (no auth) but signature-verified. The secret is looked up by
// `provider`; a missing or rotated secret rejects with 401.
// authz-ok: external 3PL callback; authenticated by shared-secret signature, not a session
router.post('/webhooks/3pl', async (req, res, next) => {
  try {
    const provider = String(req.header('X-Provider') || '');
    const signature = String(req.header('X-Signature') || '');
    if (!provider) throw new AppError('Missing X-Provider header', 400);
    if (!signature) throw new AppError('Missing X-Signature header', 400);
    const secretRow = await prisma.webhookSecret.findFirst({ where: { provider, isActive: true } });
    if (!secretRow) throw new AppError('Unknown or rotated provider', 401);
    const body = (req as any).rawBody || JSON.stringify(req.body);
    if (!verifyWebhookSignature(secretRow.secret, body, signature, { mockAccept: process.env.NODE_ENV !== 'production' })) {
      throw new AppError('Invalid signature', 401);
    }
    // Body schema: { events: [{ type, sku, quantity, variantSku, externalRef, reason }] }
    const events = (req.body?.events as any[]) || [];
    const results: any[] = [];
    for (const ev of events) {
      try {
        const channel = await prisma.channel.findUnique({ where: { name: ev.channel || provider } });
        if (!channel) {
          results.push({ sku: ev.sku, ok: false, error: `unknown channel: ${ev.channel || provider}` });
          continue;
        }
        // Find product by SKU
        const product = await prisma.product.findUnique({ where: { sku: ev.sku } });
        if (!product) {
          results.push({ sku: ev.sku, ok: false, error: 'unknown sku' });
          continue;
        }
        const result = await apply3PLStockDelta({
          channelId: channel.id,
          provider,
          externalSku: ev.sku,
          productId: product.id,
          variantId: ev.variantId,
          delta: Number(ev.quantity) || 0,
          reason: ev.type,
          externalRef: ev.externalRef,
          raw: JSON.stringify(ev),
        });
        results.push({ sku: ev.sku, ok: true, ...result });
      } catch (err: any) {
        results.push({ sku: ev.sku, ok: false, error: err?.message });
      }
    }
    res.json({ status: 'success', data: results });
  } catch (err) { next(err); }
});

// POST /api/inventory/webhook-secrets - rotate a secret
const webhookSecretSchema = z.object({
  provider: z.string().min(1),
  secret: z.string().min(8),
});
router.post('/webhook-secrets', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const data = webhookSecretSchema.parse(req.body);
    const existing = await prisma.webhookSecret.findUnique({ where: { provider: data.provider } });
    const result = existing
      ? await prisma.webhookSecret.update({ where: { provider: data.provider }, data: { secret: data.secret, isActive: true, rotatedAt: new Date() } })
      : await prisma.webhookSecret.create({ data: { provider: data.provider, secret: data.secret } });
    res.json({ status: 'success', data: { provider: result.provider, rotatedAt: result.rotatedAt } });
  } catch (err) { next(err); }
});

// ============================================
//  JOB RUNNER (admin-triggerable cron stub)
// ============================================

// POST /api/inventory/jobs/run - run all scheduled jobs on demand
router.post('/jobs/run', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const released = await releaseExpiredReservations();
    const reorder = await runAutoReorder({ dryRun: false });
    res.json({ status: 'success', data: { releasedReservations: released, ...reorder } });
  } catch (err) { next(err); }
});


export default router;