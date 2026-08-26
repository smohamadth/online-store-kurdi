/**
 * Variant service (first-class).
 *
 * The variant is now a first-class entity with its own slug,
 * gallery, URL, and typed option linkage. The product is a
 * "container" that groups related variants; the customer
 * usually decides on a specific variant (size, color, etc.) not
 * on the product as a whole.
 *
 * This file is the single home for variant business rules:
 *   - SKU uniqueness (the schema also enforces @unique, but we
 *     surface a 409 with a useful message)
 *   - Slug uniqueness (parallel to SKU)
 *   - Price > 0
 *   - compareAtPrice >= price (the "was" cannot be less than the "is")
 *   - Quantity >= 0
 *   - Attributes JSON round-trip
 *   - Soft delete by default (variants have FK references from
 *     OrderItem, CartItem, and StockReservation)
 *   - "First-class lookup" - findByIdOrSlug accepts either the
 *     primary key or the URL slug.
 */
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { serializeAttributes, parseAttributes } from './variant.helpers';

export { serializeAttributes, parseAttributes };

export interface VariantInput {
  name: string;
  sku: string;
  slug?: string;
  price: number;
  compareAtPrice?: number;
  quantity?: number;
  attributes?: Record<string, unknown> | string;
  isActive?: boolean;
  sortOrder?: number;
}

export interface VariantRow {
  id: string;
  productId: string;
  name: string;
  sku: string;
  slug: string | null;
  price: number;
  compareAtPrice: number | null;
  quantity: number;
  attributes: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

/** First-class lookup: by primary key OR by URL slug. */
export async function findByIdOrSlug(idOrSlug: string): Promise<VariantRow> {
  const v = await prisma.variant.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
  });
  if (!v) throw new AppError('Variant not found', 404);
  return v;
}

export async function getVariant(id: string): Promise<VariantRow> {
  const v = await prisma.variant.findUnique({ where: { id } });
  if (!v) throw new AppError('Variant not found', 404);
  return v;
}

export interface VariantListFilters {
  productId?: string;
  isActive?: boolean;
  sku?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  optionValueId?: string;
  search?: string;
  skip?: number;
  take?: number;
}
export async function listAllVariants(filters: VariantListFilters = {}): Promise<VariantRow[]> {
  const where: Record<string, unknown> = {};
  if (filters.productId) where.productId = filters.productId;
  if (filters.isActive !== undefined) where.isActive = filters.isActive;
  if (filters.sku) where.sku = { contains: filters.sku };
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    where.price = {
      ...(filters.minPrice !== undefined ? { gte: filters.minPrice } : {}),
      ...(filters.maxPrice !== undefined ? { lte: filters.maxPrice } : {}),
    };
  }
  if (filters.inStock === true) where.quantity = { gt: 0 };
  if (filters.inStock === false) where.quantity = 0;
  if (filters.optionValueId) {
    where.optionValues = { some: { optionValueId: filters.optionValueId } };
  }
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search } },
      { sku: { contains: filters.search } },
    ];
  }
  return prisma.variant.findMany({
    where,
    orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    skip: filters.skip,
    take: filters.take,
  });
}

export async function listVariants(productId: string): Promise<VariantRow[]> {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new AppError('Product not found', 404);
  return prisma.variant.findMany({
    where: { productId },
    orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });
}

export async function createVariant(productId: string, input: VariantInput): Promise<VariantRow> {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new AppError('Product not found', 404);
  if (input.price <= 0) throw new AppError('price must be a positive number', 400);
  if (input.compareAtPrice !== undefined) {
    if (input.compareAtPrice < 0) throw new AppError('compareAtPrice must be >= 0', 400);
    if (input.compareAtPrice > 0 && input.compareAtPrice < input.price) {
      throw new AppError('compareAtPrice must be >= price (the "was" cannot be less than the "is")', 400);
    }
  }
  const qty = input.quantity ?? 0;
  if (qty < 0 || !Number.isInteger(qty)) {
    throw new AppError('quantity must be a non-negative integer', 400);
  }
  if (!input.name?.trim()) throw new AppError('name is required', 400);
  if (!input.sku?.trim()) throw new AppError('sku is required', 400);
  const dup = await prisma.variant.findUnique({ where: { sku: input.sku } });
  if (dup) throw new AppError(`Variant with SKU "${input.sku}" already exists`, 409);
  if (input.slug?.trim()) {
    const slugDup = await prisma.variant.findUnique({ where: { slug: input.slug } });
    if (slugDup) throw new AppError(`Variant with slug "${input.slug}" already exists`, 409);
  }
  const attrs = serializeAttributes(input.attributes);
  return prisma.variant.create({
    data: {
      productId,
      name: input.name.trim(),
      sku: input.sku.trim(),
      slug: input.slug?.trim() || null,
      price: input.price,
      compareAtPrice: input.compareAtPrice ?? null,
      quantity: qty,
      attributes: attrs,
      isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? 0,
    },
  });
}

export async function updateVariant(id: string, input: Partial<VariantInput>): Promise<VariantRow> {
  const existing = await prisma.variant.findUnique({ where: { id } });
  if (!existing) throw new AppError('Variant not found', 404);
  if (input.price !== undefined && input.price <= 0) {
    throw new AppError('price must be a positive number', 400);
  }
  if (input.quantity !== undefined && (input.quantity < 0 || !Number.isInteger(input.quantity))) {
    throw new AppError('quantity must be a non-negative integer', 400);
  }
  if (input.sku !== undefined && input.sku !== existing.sku) {
    const dup = await prisma.variant.findUnique({ where: { sku: input.sku } });
    if (dup) throw new AppError(`Variant with SKU "${input.sku}" already exists`, 409);
  }
  if (input.slug !== undefined && input.slug !== existing.slug && input.slug !== null && input.slug !== '') {
    const dup = await prisma.variant.findUnique({ where: { slug: input.slug } });
    if (dup) throw new AppError(`Variant with slug "${input.slug}" already exists`, 409);
  }
  if (input.compareAtPrice !== undefined) {
    if (input.compareAtPrice < 0) throw new AppError('compareAtPrice must be >= 0', 400);
    const effectivePrice = input.price ?? existing.price;
    if (input.compareAtPrice > 0 && input.compareAtPrice < effectivePrice) {
      throw new AppError('compareAtPrice must be >= price', 400);
    }
  }
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.sku !== undefined) data.sku = input.sku.trim();
  if (input.slug !== undefined) data.slug = input.slug?.trim() || null;
  if (input.price !== undefined) data.price = input.price;
  if (input.compareAtPrice !== undefined) data.compareAtPrice = input.compareAtPrice;
  if (input.quantity !== undefined) data.quantity = input.quantity;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
  if (input.attributes !== undefined) data.attributes = serializeAttributes(input.attributes);
  return prisma.variant.update({ where: { id }, data });
}

export async function deleteVariant(id: string, opts: { force?: boolean } = {}): Promise<VariantRow | { id: string; deleted: true }> {
  const existing = await prisma.variant.findUnique({ where: { id } });
  if (!existing) throw new AppError('Variant not found', 404);
  if (opts.force) {
    await prisma.variant.delete({ where: { id } });
    return { id, deleted: true };
  }
  return prisma.variant.update({
    where: { id },
    data: { isActive: false, quantity: 0 },
  });
}

export interface OptionInput {
  name: string;
  sortOrder?: number;
  values: { value: string; swatch?: string; sortOrder?: number }[];
}

export async function setProductOptions(productId: string, options: OptionInput[]) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new AppError('Product not found', 404);
  // Drop the existing options. Cascades to OptionValue and
  // VariantOptionValue.
  await prisma.option.deleteMany({ where: { productId } });
  for (let i = 0; i < options.length; i++) {
    const o = options[i];
    if (!o.name?.trim()) throw new AppError(`Option ${i} has no name`, 400);
    const created = await prisma.option.create({
      data: { productId, name: o.name.trim(), sortOrder: o.sortOrder ?? i },
    });
    for (let j = 0; j < o.values.length; j++) {
      const v = o.values[j];
      if (!v.value?.trim()) throw new AppError(`Option "${o.name}" value ${j} has no value`, 400);
      await prisma.optionValue.create({
        data: {
          optionId: created.id,
          value: v.value.trim(),
          swatch: v.swatch || null,
          sortOrder: v.sortOrder ?? j,
        },
      });
    }
  }
  return prisma.option.findMany({
    where: { productId },
    orderBy: { sortOrder: 'asc' },
    include: { values: { orderBy: { sortOrder: 'asc' } } },
  });
}

export async function getProductOptions(productId: string) {
  return prisma.option.findMany({
    where: { productId },
    orderBy: { sortOrder: 'asc' },
    include: { values: { orderBy: { sortOrder: 'asc' } } },
  });
}

export async function setVariantOptionValues(variantId: string, optionValueIds: string[]) {
  const variant = await prisma.variant.findUnique({ where: { id: variantId } });
  if (!variant) throw new AppError('Variant not found', 404);
  if (optionValueIds.length > 0) {
    const found = await prisma.optionValue.findMany({ where: { id: { in: optionValueIds } } });
    if (found.length !== optionValueIds.length) {
      throw new AppError('One or more optionValueIds do not exist', 400);
    }
    const variantProductOptions = await prisma.option.findMany({
      where: { productId: variant.productId },
      include: { values: true },
    });
    const validIds = new Set<string>();
    for (const o of variantProductOptions) for (const v of o.values) validIds.add(v.id);
    for (const id of optionValueIds) {
      if (!validIds.has(id)) {
        throw new AppError(`Option value ${id} does not belong to product ${variant.productId}`, 400);
      }
    }
  }
  await prisma.variantOptionValue.deleteMany({ where: { variantId } });
  for (const optionValueId of optionValueIds) {
    await prisma.variantOptionValue.create({ data: { variantId, optionValueId } });
  }
  return prisma.variantOptionValue.findMany({
    where: { variantId },
    include: { optionValue: { include: { option: true } } },
  });
}

export async function getVariantOptionValues(variantId: string) {
  return prisma.variantOptionValue.findMany({
    where: { variantId },
    include: { optionValue: { include: { option: true } } },
  });
}
