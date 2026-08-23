/**
 * Product-variant service.
 *
 * Wraps CRUD on the ProductVariant model. The route layer
 * (`variant.routes.ts`) is thin - it handles HTTP, auth, and
 * input shape; this file is where the business rules live.
 *
 * Why a separate service:
 *   - The variants table is the most-mutated child of Product, and
 *     the operations (sku uniqueness, attribute round-trip, price
 *     floor, on-delete cascade to cart/order reservations) deserve
 *     a single place to test them.
 *   - The bulk-import path in inventory.routes.ts reuses
 *     `parseAttributes` and `serializeAttributes` instead of
 *     reinventing the JSON handling.
 */
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { serializeAttributes, parseAttributes } from './variant.helpers';

// Re-export the pure helpers so the route layer and the test file
// keep working without learning a new import path.
export { serializeAttributes, parseAttributes };

// ---------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------

export interface VariantInput {
  name: string;
  sku: string;
  price: number;
  quantity?: number;
  attributes?: Record<string, unknown> | string;
  isActive?: boolean;
}

export interface VariantRow {
  id: string;
  productId: string;
  name: string;
  sku: string;
  price: number;
  quantity: number;
  attributes: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * List all variants for a product. Returns active and inactive
 * both (admin views the inactive ones too); the storefront
 * filters on its end.
 */
export async function listVariants(productId: string): Promise<VariantRow[]> {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new AppError('Product not found', 404);
  return prisma.productVariant.findMany({
    where: { productId },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });
}

export async function getVariant(id: string): Promise<VariantRow> {
  const v = await prisma.productVariant.findUnique({ where: { id } });
  if (!v) throw new AppError('Variant not found', 404);
  return v;
}

/**
 * Create a variant. Validates:
 *   - product exists
 *   - sku is unique across the whole table (the schema enforces
 *     @unique, but we surface a 409 with a useful message)
 *   - price > 0
 *   - quantity >= 0
 *   - attributes round-trips through JSON cleanly
 *
 * `attributes` is stored as a string; the helper above handles the
 * conversion. The return value includes the JSON-parsed `attributes`
 * for the consumer's convenience.
 */
export async function createVariant(
  productId: string,
  input: VariantInput
): Promise<VariantRow> {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new AppError('Product not found', 404);
  if (input.price <= 0) {
    throw new AppError('price must be a positive number', 400);
  }
  const qty = input.quantity ?? 0;
  if (qty < 0 || !Number.isInteger(qty)) {
    throw new AppError('quantity must be a non-negative integer', 400);
  }
  if (!input.name?.trim()) {
    throw new AppError('name is required', 400);
  }
  if (!input.sku?.trim()) {
    throw new AppError('sku is required', 400);
  }
  const dup = await prisma.productVariant.findUnique({ where: { sku: input.sku } });
  if (dup) {
    throw new AppError(`Variant with SKU "${input.sku}" already exists`, 409);
  }
  const attrs = serializeAttributes(input.attributes);
  return prisma.productVariant.create({
    data: {
      productId,
      name: input.name.trim(),
      sku: input.sku.trim(),
      price: input.price,
      quantity: qty,
      attributes: attrs,
      isActive: input.isActive ?? true,
    },
  });
}

/**
 * Update a variant. All fields are optional; the caller sends
 * only what they want to change.
 *
 * Sku uniqueness is re-checked: a PATCH that changes the sku to
 * one another variant already uses returns 409.
 */
export async function updateVariant(
  id: string,
  input: Partial<VariantInput>
): Promise<VariantRow> {
  const existing = await prisma.productVariant.findUnique({ where: { id } });
  if (!existing) throw new AppError('Variant not found', 404);
  if (input.price !== undefined && input.price <= 0) {
    throw new AppError('price must be a positive number', 400);
  }
  if (input.quantity !== undefined && (input.quantity < 0 || !Number.isInteger(input.quantity))) {
    throw new AppError('quantity must be a non-negative integer', 400);
  }
  if (input.sku !== undefined && input.sku !== existing.sku) {
    const dup = await prisma.productVariant.findUnique({ where: { sku: input.sku } });
    if (dup) throw new AppError(`Variant with SKU "${input.sku}" already exists`, 409);
  }
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.sku !== undefined) data.sku = input.sku.trim();
  if (input.price !== undefined) data.price = input.price;
  if (input.quantity !== undefined) data.quantity = input.quantity;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.attributes !== undefined) data.attributes = serializeAttributes(input.attributes);
  return prisma.productVariant.update({ where: { id }, data });
}

/**
 * Delete a variant.
 *
 * Soft delete (set isActive=false) is the default because variants
 * typically have FK references from OrderItem, CartItem, and
 * StockReservation that would otherwise leave dangling rows. The
 * `force: true` option bypasses the soft path and issues a real
 * DELETE - use this only for variants that have no history
 * (typically brand-new test fixtures).
 */
export async function deleteVariant(id: string, opts: { force?: boolean } = {}): Promise<VariantRow | { id: string; deleted: true }> {
  const existing = await prisma.productVariant.findUnique({ where: { id } });
  if (!existing) throw new AppError('Variant not found', 404);
  if (opts.force) {
    await prisma.productVariant.delete({ where: { id } });
    return { id, deleted: true };
  }
  return prisma.productVariant.update({
    where: { id },
    data: { isActive: false, quantity: 0 },
  });
}
