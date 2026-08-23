/**
 * Inventory service - the orchestrating layer for the entire
 * inventory subsystem.
 *
 * Responsibilities:
 *   - Variant-level stock decrement on order placement
 *   - Backorder handling (allow orders on out-of-stock products when
 *     `allowBackorder` is set)
 *   - Stock reservation lifecycle (cart hold + release)
 *   - Stock-take cycle counts
 *   - Warehouse transfers and per-warehouse stock queries
 *   - Auto-reorder rule evaluation and draft creation
 *   - 3PL / marketplace stock sync log
 *
 * Design notes:
 *   - Every state change is logged to InventoryLog for audit.
 *   - Reservations expire on `reservedUntil`; the release endpoint
 *     scans for expired ones and either decrements (if expired
 *     before consumption) or no-ops (if consumed by an order).
 *   - Auto-reorder is best-effort: a single broken rule should not
 *     block other rules.
 *   - All multi-warehouse writes are coordinated via a single
 *     prisma.$transaction so a partial failure cannot leave
 *     warehouse + product columns inconsistent.
 */
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { AppError } from '../../middleware/errorHandler';
import { verifyWebhookSignature as verifyWebhookSignatureHelper } from './inventory.helpers';

// ---------------------------------------------------------------------
// Variant-aware stock decrement
// ---------------------------------------------------------------------

export interface DecrementRequest {
  productId: string;
  variantId?: string;
  warehouseId?: string;
  quantity: number;
  orderId?: string;
  userId?: string;
}

export interface DecrementResult {
  newQuantity: number;
  previousQuantity: number;
  wasBackorder: boolean;
  reservationReleased: boolean;
}

/**
 * Decrement stock for a product (and optionally a variant / warehouse)
 * with backorder support. If the product allows backorders and the
 * available quantity is insufficient, the order is allowed and the
 * row goes negative. Otherwise an AppError is thrown.
 *
 * Idempotency: if the product's `trackInventory` is false, this is a
 * no-op. The caller decides whether to call this at all (e.g. for
 * digital products the order pipeline skips inventory entirely).
 */
export async function decrementStock(req: DecrementRequest): Promise<DecrementResult> {
  const { productId, variantId, quantity, orderId, userId } = req;

  // For per-warehouse stock we use a transaction so the warehouse
  // row and the parent product row stay consistent.
  return prisma.$transaction(async (tx: any) => {
    const product = await tx.product.findUnique({ where: { id: productId } });
    if (!product) throw new AppError(`Product not found: ${productId}`, 404);
    if (!product.trackInventory) {
      return { newQuantity: product.quantity, previousQuantity: product.quantity, wasBackorder: false, reservationReleased: false };
    }

    if (variantId) {
      const variant = await tx.productVariant.findUnique({ where: { id: variantId } });
      if (!variant) throw new AppError(`Variant not found: ${variantId}`, 404);
      const previous = variant.quantity;
      const newQty = previous - quantity;
      if (newQty < 0 && !product.allowBackorder) {
        throw new AppError(`Insufficient stock for variant ${variant.sku} (have ${previous}, need ${quantity})`, 400);
      }
      // Backorder limit: the schema allows a per-product cap on how
      // far into the negative an order can drive stock. If the cap is
      // set and the resulting quantity would underflow it, reject the
      // line. `backorderLimit` is measured on the parent product
      // because it is what the storefront displays; for variants we
      // apply it to the variant quantity (which is what the order
      // actually consumes).
      if (newQty < 0 && product.backorderLimit != null && -newQty > product.backorderLimit) {
        throw new AppError(
          `Backorder limit exceeded for ${product.name}: cap is ${product.backorderLimit}, this order would put stock at ${newQty}`,
          400
        );
      }
      const wasBackorder = newQty < 0;
      await tx.productVariant.update({ where: { id: variantId }, data: { quantity: newQty } });
      // Decrement parent product's denormalised quantity too.
      const parentDelta = wasBackorder ? 0 : quantity;
      if (parentDelta > 0) {
        await tx.product.update({ where: { id: productId }, data: { quantity: { decrement: parentDelta } } });
      }
      await tx.inventoryLog.create({
        data: {
          productId,
          variantId,
          quantityChange: -quantity,
          previousQuantity: previous,
          newQuantity: newQty,
          reason: wasBackorder ? 'backorder' : 'sale',
          orderId: orderId ?? null,
          createdBy: userId ?? null,
        },
      });
      return { newQuantity: newQty, previousQuantity: previous, wasBackorder, reservationReleased: false };
    }

    // No variant.
    const previous = product.quantity;
    const newQty = previous - quantity;
    if (newQty < 0 && !product.allowBackorder) {
      throw new AppError(`Insufficient stock for ${product.name} (have ${previous}, need ${quantity})`, 400);
    }
    if (newQty < 0 && product.backorderLimit != null && -newQty > product.backorderLimit) {
      throw new AppError(
        `Backorder limit exceeded for ${product.name}: cap is ${product.backorderLimit}, this order would put stock at ${newQty}`,
        400
      );
    }
    const wasBackorder = newQty < 0;
    await tx.product.update({ where: { id: productId }, data: { quantity: newQty } });
    await tx.inventoryLog.create({
      data: {
        productId,
        variantId: null,
        quantityChange: -quantity,
        previousQuantity: previous,
        newQuantity: newQty,
        reason: wasBackorder ? 'backorder' : 'sale',
        orderId: orderId ?? null,
        createdBy: userId ?? null,
      },
    });
    return { newQuantity: newQty, previousQuantity: previous, wasBackorder, reservationReleased: false };
  });
}

/**
 * Reverse of decrementStock - used on order cancellation and
 * returns. The audit-log reason is set accordingly.
 */
export async function incrementStock(req: DecrementRequest & { reason?: 'return' | 'cancel' | 'manual'; notes?: string }): Promise<DecrementResult> {
  const { productId, variantId, quantity, orderId, userId, reason, notes } = req;
  return prisma.$transaction(async (tx: any) => {
    if (variantId) {
      const variant = await tx.productVariant.findUnique({ where: { id: variantId } });
      if (!variant) throw new AppError(`Variant not found: ${variantId}`, 404);
      const previous = variant.quantity;
      const newQty = previous + quantity;
      await tx.productVariant.update({ where: { id: variantId }, data: { quantity: newQty } });
      // If the product is NOT backorder-allowed, restoring decrements
      // from a real order should bump the parent too.
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (product && !product.allowBackorder) {
        await tx.product.update({ where: { id: productId }, data: { quantity: { increment: quantity } } });
      }
      await tx.inventoryLog.create({
        data: {
          productId,
          variantId,
          quantityChange: quantity,
          previousQuantity: previous,
          newQuantity: newQty,
          reason: reason ?? 'return',
          orderId: orderId ?? null,
          createdBy: userId ?? null,
          notes: notes ?? null,
        },
      });
      return { newQuantity: newQty, previousQuantity: previous, wasBackorder: false, reservationReleased: false };
    }
    const product = await tx.product.findUnique({ where: { id: productId } });
    if (!product) throw new AppError(`Product not found: ${productId}`, 404);
    const previous = product.quantity;
    const newQty = previous + quantity;
    await tx.product.update({ where: { id: productId }, data: { quantity: newQty } });
    await tx.inventoryLog.create({
      data: {
        productId,
        variantId: null,
        quantityChange: quantity,
        previousQuantity: previous,
        newQuantity: newQty,
        reason: reason ?? 'return',
        orderId: orderId ?? null,
        createdBy: userId ?? null,
        notes: notes ?? null,
      },
    });
    return { newQuantity: newQty, previousQuantity: previous, wasBackorder: false, reservationReleased: false };
  });
}

// ---------------------------------------------------------------------
// Stock reservations
// ---------------------------------------------------------------------

const RESERVATION_TTL_MIN = 15; // minutes

export interface CreateReservationRequest {
  productId: string;
  variantId?: string;
  quantity: number;
  cartItemId?: string;
  reason?: 'cart_hold' | 'backorder' | 'manual';
  ttlMinutes?: number;
}

/**
 * Reserve `quantity` units of a product for a cart hold or a
 * backorder. Returns the new reservation row. The reserved count
 * does NOT change the visible `quantity` until the reservation is
 * actually consumed (i.e. on order placement), but it is counted
 * against the available pool for other carts.
 *
 * For the demo mock the warehouse pool is implicit (parent
 * `quantity - sum(active reservations)`). The mock prisma supports
 * this through the StockReservation model.
 */
export async function createReservation(req: CreateReservationRequest) {
  const ttl = (req.ttlMinutes ?? RESERVATION_TTL_MIN) * 60 * 1000;
  const reservedUntil = new Date(Date.now() + ttl);
  return prisma.stockReservation.create({
    data: {
      productId: req.productId,
      variantId: req.variantId ?? null,
      quantity: req.quantity,
      reservedUntil,
      reason: req.reason ?? 'cart_hold',
      cartItemId: req.cartItemId ?? null,
      originType: req.cartItemId ? 'cart' : (req.reason === 'backorder' ? 'order' : 'manual'),
      originId: req.cartItemId ?? null,
    },
  });
}

/**
 * Consume a reservation - used at order-placement to convert the
 * hold into an actual decrement. Marks the reservation as released
 * with `releasedAt` set to now (so the audit trail is preserved).
 */
export async function consumeReservation(reservationId: string) {
  return prisma.stockReservation.update({
    where: { id: reservationId },
    data: { releasedAt: new Date() },
  });
}

/**
 * Manually release a single reservation (admin action: a customer
 * cancelled their cart, an integration needed to free the stock).
 * Idempotent: if the reservation is already released, returns it
 * unchanged rather than erroring on a Prisma "no rows updated"
 * edge case.
 */
export async function releaseReservation(reservationId: string) {
  const existing = await prisma.stockReservation.findUnique({ where: { id: reservationId } });
  if (!existing) {
    throw new AppError(`Reservation not found: ${reservationId}`, 404);
  }
  if (existing.releasedAt) return existing;
  return prisma.stockReservation.update({
    where: { id: reservationId },
    data: { releasedAt: new Date() },
  });
}

/**
 * Extend (or shorten) a reservation's TTL. The new `reservedUntil`
 * is computed relative to NOW, not the previous deadline - so passing
 * 5 always means "5 minutes from this call", not "5 minutes after
 * the old deadline". This matches what an admin clicking "give them
 * 10 more minutes" expects.
 *
 * Refuses to extend a reservation that is already released.
 */
export async function extendReservation(reservationId: string, ttlMinutes: number) {
  if (!Number.isFinite(ttlMinutes) || ttlMinutes < 1) {
    throw new AppError('ttlMinutes must be a positive number', 400);
  }
  const existing = await prisma.stockReservation.findUnique({ where: { id: reservationId } });
  if (!existing) {
    throw new AppError(`Reservation not found: ${reservationId}`, 404);
  }
  if (existing.releasedAt) {
    throw new AppError('Cannot extend a released reservation', 400);
  }
  return prisma.stockReservation.update({
    where: { id: reservationId },
    data: { reservedUntil: new Date(Date.now() + ttlMinutes * 60 * 1000) },
  });
}

/**
 * Consume every active reservation tied to a set of cart items.
 * Called from the order pipeline after the order is created: the
 * cart items are deleted, but their reservations live on as
 * `releasedAt = now` for audit. This prevents the post-order
 * "available" pool from being artificially drained.
 */
export async function consumeReservationsForCartItemIds(cartItemIds: string[]) {
  if (cartItemIds.length === 0) return 0;
  const r = await prisma.stockReservation.updateMany({
    where: {
      cartItemId: { in: cartItemIds },
      releasedAt: null,
    },
    data: { releasedAt: new Date() },
  });
  return r.count;
}

/**
 * Release all expired reservations. Returns the count of reservations
 * released. Safe to call on a cron or on every cart read - it
 * uses an atomic updateMany + a fetch for the IDs.
 */
export async function releaseExpiredReservations(now: Date = new Date()): Promise<number> {
  // Mark all expired, not-yet-released rows as released. This is the
  // "soft release" - the row stays in the DB for audit. The actual
  // reserved count is computed dynamically (releasedAt IS NULL
  // counts as held).
  const result = await prisma.stockReservation.updateMany({
    where: { releasedAt: null, reservedUntil: { lt: now } },
    data: { releasedAt: now },
  });
  return result.count;
}

/**
 * Compute the *available* (un-reserved) quantity for a product.
 * Subtracts the sum of active reservations from the parent quantity.
 * The mock prisma supports this through prisma.stockReservation.aggregate.
 */
export async function availableQuantity(productId: string, variantId?: string): Promise<number> {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return 0;
  if (variantId) {
    const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) return 0;
    const reserved = await prisma.stockReservation.aggregate({
      where: {
        productId,
        variantId,
        releasedAt: null,
        reservedUntil: { gt: new Date() },
      },
      _sum: { quantity: true },
    });
    return Math.max(0, variant.quantity - (reserved._sum.quantity ?? 0));
  }
  const reserved = await prisma.stockReservation.aggregate({
    where: { productId, variantId: null, releasedAt: null, reservedUntil: { gt: new Date() } },
    _sum: { quantity: true },
  });
  return Math.max(0, product.quantity - (reserved._sum.quantity ?? 0));
}

// ---------------------------------------------------------------------
// Stock takes (cycle counts)
// ---------------------------------------------------------------------

export interface StockTakeItemInput {
  productId: string;
  variantId?: string;
  expected: number;
  counted: number;
  notes?: string;
}

/**
 * Create a stock-take session and seed it with the book quantities
 * for the given items. The session is `in_progress`; the user
 * updates the `counted` field per row, then `applyStockTake` is
 * called to commit.
 */
export async function createStockTake(args: {
  warehouseId: string;
  name: string;
  notes?: string;
  createdBy?: string;
  items: StockTakeItemInput[];
}) {
  return prisma.$transaction(async (tx: any) => {
    const take = await tx.stockTake.create({
      data: {
        warehouseId: args.warehouseId,
        name: args.name,
        notes: args.notes ?? null,
        createdBy: args.createdBy ?? null,
        status: 'in_progress',
      },
    });
    for (const it of args.items) {
      await tx.stockTakeItem.create({
        data: {
          stockTakeId: take.id,
          productId: it.productId,
          variantId: it.variantId ?? null,
          warehouseId: args.warehouseId,
          expected: it.expected,
          counted: it.counted,
          variance: it.counted - it.expected,
          notes: it.notes ?? null,
        },
      });
    }
    return take;
  });
}

/**
 * Apply a stock-take: for every row, write an InventoryLog and
 * adjust the parent product's quantity by the variance. Cancels
 * the session if `cancel: true`.
 */
export async function applyStockTake(stockTakeId: string, args: { cancel?: boolean; userId?: string } = {}) {
  return prisma.$transaction(async (tx: any) => {
    const take = await tx.stockTake.findUnique({ where: { id: stockTakeId } });
    if (!take) throw new AppError(`Stock take not found: ${stockTakeId}`, 404);
    if (take.status !== 'in_progress') {
      throw new AppError(`Stock take is ${take.status}, can only apply in_progress`, 400);
    }
    if (args.cancel) {
      return tx.stockTake.update({
        where: { id: stockTakeId },
        data: { status: 'cancelled', cancelledAt: new Date() },
      });
    }
    const items = await tx.stockTakeItem.findMany({ where: { stockTakeId } });
    for (const item of items) {
      if (item.variance === 0) continue;
      // For the parent product, only adjust the parent if no variant
      // is involved. For variants, adjust both the variant and the
      // parent (the parent's quantity is denormalised).
      if (item.variantId) {
        const variant = await tx.productVariant.findUnique({ where: { id: item.variantId } });
        if (variant) {
          const previous = variant.quantity;
          const newQty = item.counted;
          await tx.productVariant.update({ where: { id: item.variantId }, data: { quantity: newQty } });
          await tx.inventoryLog.create({
            data: {
              productId: item.productId,
              variantId: item.variantId,
              quantityChange: newQty - previous,
              previousQuantity: previous,
              newQuantity: newQty,
              reason: 'cycle_count',
              notes: `Stock take ${take.id}: ${item.notes ?? ''}`,
              createdBy: args.userId ?? null,
            },
          });
        }
      }
      // Adjust parent product too. The parent quantity is
      // denormalised, so we apply the variance directly.
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (product) {
        const previous = product.quantity;
        const newQty = previous + item.variance;
        await tx.product.update({ where: { id: item.productId }, data: { quantity: newQty } });
        await tx.inventoryLog.create({
          data: {
            productId: item.productId,
            variantId: item.variantId,
            quantityChange: item.variance,
            previousQuantity: previous,
            newQuantity: newQty,
            reason: 'cycle_count',
            notes: `Stock take ${take.id}: ${item.notes ?? ''}`,
            createdBy: args.userId ?? null,
          },
        });
      }
    }
    return tx.stockTake.update({
      where: { id: stockTakeId },
      data: { status: 'applied', appliedAt: new Date() },
    });
  });
}

// ---------------------------------------------------------------------
// Warehouses
// ---------------------------------------------------------------------

/**
 * Get the default warehouse. If none exists, create one called
 * "Main" and mark it as default. This is called when stock-take or
 * reorder operations need a warehouse to attach to.
 */
export async function getOrCreateDefaultWarehouse(): Promise<{ id: string; code: string; name: string }> {
  const existing = await prisma.warehouse.findFirst({ where: { isDefault: true } });
  if (existing) return existing;
  const created = await prisma.warehouse.create({
    data: { name: 'Main', code: 'MAIN', isDefault: true },
  });
  logger.info(`Created default warehouse ${created.code}`);
  return created;
}

// ---------------------------------------------------------------------
// Auto-reorder
// ---------------------------------------------------------------------

export interface AutoReorderResult {
  scanned: number;
  draftsCreated: number;
  errors: { ruleId: string; reason: string }[];
}

/**
 * Scan all active reorder rules. For each rule whose product's
 * effective stock is at or below the threshold, create a
 * ReorderDraft. Idempotent within the same run: if a draft for
 * that rule + warehouse already exists in `draft` status, the
 * existing one is left alone.
 */
export async function runAutoReorder(args: { dryRun?: boolean } = {}): Promise<AutoReorderResult> {
  const rules = await prisma.reorderRule.findMany({ where: { isActive: true } });
  const errors: { ruleId: string; reason: string }[] = [];
  let draftsCreated = 0;
  for (const rule of rules) {
    try {
      const product = await prisma.product.findUnique({ where: { id: rule.productId } });
      if (!product) continue;
      // Effective stock for the rule = product.quantity - sum(active
      // reservations) if no variant, or the variant quantity.
      let effectiveStock = product.quantity;
      if (rule.variantId) {
        const v = await prisma.productVariant.findUnique({ where: { id: rule.variantId } });
        if (v) effectiveStock = v.quantity;
      }
      const reserved = await prisma.stockReservation.aggregate({
        where: {
          productId: rule.productId,
          variantId: rule.variantId ?? null,
          releasedAt: null,
          reservedUntil: { gt: new Date() },
        },
        _sum: { quantity: true },
      });
      effectiveStock = effectiveStock - (reserved._sum.quantity ?? 0);
      if (effectiveStock > rule.threshold) continue;

      // Idempotency: skip if any draft (in any status other than
      // 'received' or 'cancelled') exists. This ensures we don't
      // re-draft something the operator has already sent.
      const existing = await prisma.reorderDraft.findFirst({
        where: {
          ruleId: rule.id,
          status: { in: ['draft', 'sent'] },
        },
      });
      if (existing) continue;

      if (args.dryRun) {
        draftsCreated++;
        continue;
      }
      await prisma.reorderDraft.create({
        data: {
          ruleId: rule.id,
          productId: rule.productId,
          variantId: rule.variantId ?? null,
          warehouseId: rule.warehouseId ?? null,
          quantity: rule.reorderQty,
          status: 'draft',
          supplierName: rule.supplierName,
        },
      });
      draftsCreated++;
    } catch (err: any) {
      errors.push({ ruleId: rule.id, reason: err?.message ?? 'unknown' });
      logger.warn(`Auto-reorder failed for rule ${rule.id}: ${err?.message}`);
    }
  }
  return { scanned: rules.length, draftsCreated, errors };
}

// ---------------------------------------------------------------------
// 3PL / marketplace stock sync
// ---------------------------------------------------------------------

/**
 * Apply a stock delta from a 3PL or marketplace. The delta is
 * recorded in ThreePLSyncEvent for audit, and the product's
 * `quantity` is updated. If a `channelId` is given, the per-channel
 * stock is also updated.
 *
 * Returns the resulting product quantity after the sync.
 */
export async function apply3PLStockDelta(args: {
  channelId: string;
  provider: string;
  externalSku: string;
  productId: string;
  variantId?: string;
  delta: number;
  reason?: string;
  externalRef?: string;
  raw?: string;
}) {
  return prisma.$transaction(async (tx: any) => {
    await tx.threePLSyncEvent.create({
      data: {
        channelId: args.channelId,
        provider: args.provider,
        externalSku: args.externalSku,
        internalProductId: args.productId,
        internalVariantId: args.variantId ?? null,
        delta: args.delta,
        reason: args.reason ?? null,
        externalRef: args.externalRef ?? null,
        raw: args.raw ?? null,
      },
    });
    let newQty: number;
    if (args.variantId) {
      const v = await tx.productVariant.findUnique({ where: { id: args.variantId } });
      if (!v) throw new AppError(`Variant not found: ${args.variantId}`, 404);
      newQty = v.quantity + args.delta;
      await tx.productVariant.update({ where: { id: args.variantId }, data: { quantity: Math.max(0, newQty) } });
    } else {
      const p = await tx.product.findUnique({ where: { id: args.productId } });
      if (!p) throw new AppError(`Product not found: ${args.productId}`, 404);
      newQty = p.quantity + args.delta;
      await tx.product.update({ where: { id: args.productId }, data: { quantity: Math.max(0, newQty) } });
    }
    // Per-channel stock
    await tx.channelStock.upsert({
      where: {
        channelId_productId_variantId: {
          channelId: args.channelId,
          productId: args.productId,
          variantId: args.variantId ?? null,
        },
      } as any,
      create: {
        channelId: args.channelId,
        productId: args.productId,
        variantId: args.variantId ?? null,
        quantity: Math.max(0, newQty),
      },
      update: {
        quantity: Math.max(0, newQty),
      },
    });
    return { newQuantity: Math.max(0, newQty) };
  });
}

// ---------------------------------------------------------------------
// Webhook signature verification
// ---------------------------------------------------------------------

/**
 * Re-export the shared helper so existing callers can keep using
 * `import { verifyWebhookSignature } from './inventory.service'`.
 * The implementation lives in inventory.helpers.ts.
 */
export const verifyWebhookSignature = verifyWebhookSignatureHelper;
