/**
 * Bulk import commit.
 *
 * Model: ALL-OR-NOTHING. The file is re-parsed and re-validated here
 * (the client's preview is never the source of truth). If any row has a
 * validation error, nothing is written and the error list is returned -
 * the admin fixes the file and re-imports. When every row validates,
 * all rows are applied in ONE Prisma transaction: either every row
 * lands, or (on an unexpected execution error) none of them does.
 *
 * NOTE on case-insensitivity: the SQLite provider has no
 * `mode: 'insensitive'` string filter, so all name/slug matching is done
 * in memory against the full (small) category/product-sku lists fetched
 * once per transaction. A few hundred categories is trivially cheap and
 * this keeps the behaviour identical on SQLite and PostgreSQL.
 */
import slugify from 'slugify';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../../config/database';
import {
  extractRows,
  mapCategoryRow,
  mapCustomerRow,
  mapOrderRow,
  mapProductRow,
  previewImport,
  type CategoryPlan,
  type CustomerPlan,
  type Entity,
  type ImageUrlResolver,
  type ImportFormat,
  type OrderPlan,
  type ProductPlan,
} from './mappers';
import { syncVariantAttributes } from '../products/variantAttributeIndex';

// Imported customers (onboarding order history, not credentials) get a
// RANDOM password — never a known constant. A hardcoded password
// ('Imported-Change-Me-123!' used to ship here) is public source: anyone
// could log into every account a merchant imported. With a random secret
// nobody can sign in until the real customer goes through forgot-password
// (which also flips isVerified, so the account activates properly).
const BCRYPT_ROUNDS = 10;
function randomImportedPassword(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export interface CommitError {
  row: number;
  sku?: string;
  name?: string;
  errors: string[];
}

export interface CommitResult {
  entity: Entity;
  total: number;
  created: number;
  updated: number;
  /** Rows that were NOT applied (validation or execution errors). */
  failed: number;
  errors: CommitError[];
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Case-insensitive lookup over a small entity list. */
class CiIndex<T extends { name?: string | null; slug?: string | null; id: string }> {
  private nameIdx = new Map<string, T>();
  private slugIdx = new Map<string, T>();

  constructor(rows: T[]) {
    for (const r of rows) this.add(r);
  }
  add(r: T) {
    if (r.name) this.nameIdx.set(r.name.toLowerCase(), r);
    if (r.slug) this.slugIdx.set(r.slug.toLowerCase(), r);
  }
  bySlug(slug: string): T | undefined {
    return this.slugIdx.get(slug.toLowerCase());
  }
  byName(name: string): T | undefined {
    return this.nameIdx.get(name.toLowerCase());
  }
  /** Prefer an exact slug hit, then a name hit (case-insensitive). */
  find(slug: string | undefined, name: string | undefined): T | undefined {
    if (slug) {
      const hit = this.bySlug(slug);
      if (hit) return hit;
    }
    if (name) return this.byName(name);
    return undefined;
  }
}

/** An execution-time row failure: aborts the transaction atomically. */
class RowError extends Error {
  constructor(
    public row: number,
    public sku: string | undefined,
    public rowName: string | undefined,
    public rowErrors: string[],
  ) {
    super(rowErrors.join('; '));
    this.name = 'RowError';
  }
}

async function replaceVariants(tx: Tx, productId: string, variants: NonNullable<ProductPlan['variants']>) {
  // Drop the attribute index rows of the variants being replaced (the
  // real DB cascades via FK; the explicit delete keeps the test mock -
  // which does not cascade - consistent).
  const old = await tx.variant.findMany({ where: { productId }, select: { id: true } });
  if (old.length > 0) {
    await tx.variantAttribute.deleteMany({ where: { variantId: { in: old.map((o: any) => o.id) } } });
  }
  await tx.variant.deleteMany({ where: { productId } });
  for (const v of variants) {
    const created = await tx.variant.create({
      data: {
        productId,
        name: v.name,
        sku: v.sku,
        slug: v.slug ?? null,
        price: v.price,
        compareAtPrice: v.compareAtPrice ?? null,
        quantity: v.quantity ?? 0,
        attributes: v.attributes ? JSON.stringify(v.attributes) : '{}',
        isActive: v.isActive ?? true,
        sortOrder: v.sortOrder ?? 0,
      },
    });
    // Keep the (key, value) query index in step (inside the same tx).
    await syncVariantAttributes(tx, created.id, created.attributes);
  }
}

async function replaceImages(tx: Tx, productId: string, images: NonNullable<ProductPlan['images']>) {
  await tx.productImage.deleteMany({ where: { productId } });
  // Awaits are mandatory inside the interactive transaction: an
  // un-awaited write can be skipped by the commit (or leave an
  // unhandled rejection) - the same reason replaceVariants loops.
  for (let i = 0; i < images.length; i++) {
    const im = images[i];
    await tx.productImage.create({
      data: {
        productId,
        url: im.url,
        alt: im.alt ?? null,
        isPrimary: im.isPrimary ?? i === 0,
        sortOrder: i,
      },
    });
  }
}

/**
 * Unique slug for a new product: preferred or slugified name, then
 * -2, -3, ... until it is free (case-sensitive DB uniqueness).
 */
async function uniqueProductSlug(
  tx: Tx,
  name: string,
  preferred: string | undefined,
  taken: Set<string>,
): Promise<string> {
  let base = (preferred && preferred.trim()) || slugify(name, { lower: true, strict: true });
  if (!base) base = `product-${Date.now().toString(36)}`;
  let candidate = base;
  let i = 2;
  while (taken.has(candidate)) {
    candidate = `${base}-${i++}`;
    if (i > 100) return `${base}-${Date.now().toString(36)}`;
  }
  return candidate;
}

// Apply every product row in a single Prisma transaction: either every row
// is created/updated, or (on any RowError) the whole transaction rolls back.
// Products are matched by SKU; a row whose SKU is new is created, one whose
// SKU already exists is updated. Each row's category is resolved by name or
// slug (case-insensitive) from the in-memory index built up front.
async function executeProducts(
  rawRows: Record<string, unknown>[],
  opts: { resolveImage?: ImageUrlResolver } = {},
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  await prisma.$transaction(async (tx) => {
    // Fetch the (small) reference data once and match in memory.
    const cats = await tx.category.findMany({ select: { id: true, name: true, slug: true } });
    const catIndex = new CiIndex(cats);
    const products = await tx.product.findMany({ select: { id: true, slug: true, sku: true } });
    const bySku = new Map(products.map((p) => [p.sku, p]));
    const slugsTaken = new Set<string>(products.map((p) => p.slug));

    for (let i = 0; i < rawRows.length; i++) {
      const rowNo = i + 1;
      const plan = mapProductRow(rawRows[i], null, opts);
      // The preview already rejected invalid rows; this is defensive.
      if (plan.errors.length > 0) {
        throw new RowError(rowNo, plan.sku, plan.name, plan.errors);
      }

      const categoryRef = plan.data.__category;
      delete plan.data.__category;
      const category = categoryRef
        ? catIndex.byName(categoryRef) ?? catIndex.bySlug(categoryRef)
        : catIndex.byName('general') ?? catIndex.bySlug('general');
      if (!category) {
        throw new RowError(rowNo, plan.sku, plan.name, [
          `category "${categoryRef || '(default General)'}" not found - import the category first`,
        ]);
      }
      plan.data.categoryId = category.id;

      const existing = bySku.get(plan.sku);
      if (existing) {
        // UPDATE path: the SKU already exists. Guard against the row
        // reassigning a slug that belongs to a different product.
        if (plan.data.slug) {
          const clashSlug = plan.data.slug;
          const owner = products.find((p) => p.slug === clashSlug);
          if (owner && owner.id !== existing.id) {
            throw new RowError(rowNo, plan.sku, plan.name, [`slug "${clashSlug}" belongs to another product`]);
          }
        }
        await tx.product.update({ where: { id: existing.id }, data: plan.data as any });
        updated++;
        if (plan.data.slug) {
          slugsTaken.delete(existing.slug);
          slugsTaken.add(plan.data.slug);
        }
        bySku.set(plan.sku, { ...existing, slug: plan.data.slug ?? existing.slug });
        if (plan.variants !== undefined) await replaceVariants(tx, existing.id, plan.variants);
        if (plan.images !== undefined) await replaceImages(tx, existing.id, plan.images);
      } else {
        // CREATE path: the SKU is new. Generate a unique slug (preferring the
        // provided one, then a slugified name, then a -2/-3 suffix if taken).
        const slug = await uniqueProductSlug(tx, plan.name ?? '', plan.data.slug, slugsTaken);
        // Start from schema defaults, then overlay the validated row data.
        // sku comes from plan.sku (the match key, not an updatable field).
        const data = {
          type: 'physical' as string,
          status: 'active' as string,
          trackInventory: true,
          quantity: 0,
          lowStockThreshold: 10,
          allowBackorder: false,
          weightUnit: 'kg',
          metaKeywords: '[]',
          ...plan.data,
          name: plan.name,
          sku: plan.sku,
          slug,
        };
        const createdProduct = await tx.product.create({ data: data as any });
        created++;
        slugsTaken.add(slug);
        bySku.set(plan.sku, { id: createdProduct.id, slug, sku: plan.sku });
        if (plan.variants !== undefined) await replaceVariants(tx, createdProduct.id, plan.variants);
        if (plan.images !== undefined) await replaceImages(tx, createdProduct.id, plan.images);
      }
    }
  });

  return { created, updated };
}

// Apply every category row in a single Prisma transaction (all-or-nothing,
// like executeProducts). Categories are matched by slug (if provided) then
// name (case-insensitive). A row whose slug/name is new is created, one that
// matches an existing category is updated. The parent (if given) is resolved
// by name/slug from the in-memory index built up front.
async function executeCategories(
  rawRows: Record<string, unknown>[],
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  await prisma.$transaction(async (tx) => {
    // Build a case-insensitive index of existing categories for matching.
    const cats = await tx.category.findMany({ select: { id: true, name: true, slug: true } });
    const index = new CiIndex(cats);

    for (let i = 0; i < rawRows.length; i++) {
      const rowNo = i + 1;
      const plan: CategoryPlan = mapCategoryRow(rawRows[i]);
      if (plan.errors.length > 0) {
        throw new RowError(rowNo, undefined, plan.name, plan.errors);
      }

      // Resolve the parent category (if a parent name/slug was given) to an id.
      let parentId: string | null | undefined;
      if (plan.parentRef) {
        const parent = index.find(plan.parentRef, plan.parentRef);
        if (!parent) {
          throw new RowError(rowNo, undefined, plan.name, [`parent category "${plan.parentRef}" not found`]);
        }
        parentId = parent.id;
      }

      const existing = plan.bySlug ? index.bySlug(plan.matchKey) : index.byName(plan.matchKey);

      if (existing) {
        if (parentId !== undefined && parentId === existing.id) {
          throw new RowError(rowNo, undefined, plan.name, ['a category cannot be its own parent']);
        }
        if (plan.data.slug) {
          const slugOwner = index.bySlug(plan.data.slug);
          if (slugOwner && slugOwner.id !== existing.id) {
            throw new RowError(rowNo, undefined, plan.name, [`slug "${plan.data.slug}" belongs to another category`]);
          }
        }
        const data: Record<string, any> = { ...plan.data };
        if (parentId !== undefined) data.parentId = parentId;
        await tx.category.update({ where: { id: existing.id }, data });
        updated++;
        // Refresh the in-memory index so later rows match the new value.
        index.add({ id: existing.id, name: plan.data.name ?? existing.name, slug: plan.data.slug ?? existing.slug });
      } else {
        // CREATE path: the category is new. Use the provided slug, or slugify
        // the name, or a timestamp slug; if that slug is already taken, append
        // -2, -3, ... until it is free.
        let slug = plan.data.slug || slugify(plan.name ?? 'category', { lower: true, strict: true }) || `category-${Date.now().toString(36)}`;
        let i2 = 2;
        while (index.bySlug(slug)) {
          slug = `${plan.data.slug || slugify(plan.name ?? 'category', { lower: true, strict: true })}-${i2++}`;
        }
        const createdCat = await tx.category.create({
          data: {
            name: plan.name!,
            slug,
            description: plan.data.description,
            image: plan.data.image,
            isActive: plan.data.isActive ?? true,
            sortOrder: plan.data.sortOrder ?? 0,
            parentId: parentId ?? null,
          },
        });
        created++;
        index.add({ id: createdCat.id, name: createdCat.name, slug: createdCat.slug });
      }
    }
  });

  return { created, updated };
}

// Apply every customer row in a single Prisma transaction. Customers are
// matched by email (case-insensitive). A new email creates a customer (with a
// placeholder password - import is about onboarding account data, not
// credentials); an existing one is updated with the provided fields. When the
// `addresses` column is present it REPLACES the customer's address rows.
async function executeCustomers(
  rawRows: Record<string, unknown>[],
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  await prisma.$transaction(async (tx) => {
    const users = await tx.user.findMany({ where: {}, select: { id: true, email: true } });
    const byEmail = new Map<string, { id: string; email: string }>(users.map((u) => [u.email.toLowerCase(), u]));

    for (let i = 0; i < rawRows.length; i++) {
      const rowNo = i + 1;
      const plan: CustomerPlan = mapCustomerRow(rawRows[i]);
      if (plan.errors.length > 0) throw new RowError(rowNo, plan.email, undefined, plan.errors);

      const existing = byEmail.get(plan.email);
      if (existing) {
        const data: Record<string, any> = { ...plan.data };
        // email is the match key, never updated.
        delete data.email;
        await tx.user.update({ where: { id: existing.id }, data: data as any });
        if (plan.addresses !== undefined) {
          await tx.address.deleteMany({ where: { userId: existing.id } });
          for (const a of plan.addresses) {
            await tx.address.create({ data: { userId: existing.id, ...a } as any });
          }
        }
        updated++;
      } else {
        const password = await bcrypt.hash(randomImportedPassword(), BCRYPT_ROUNDS);
        const user = await tx.user.create({
          data: {
            email: plan.email,
            password,
            firstName: plan.data.firstName ?? plan.email.split('@')[0],
            lastName: plan.data.lastName ?? '',
            phone: plan.data.phone ?? null,
            isActive: plan.data.isActive ?? true,
            role: 'customer',
            isVerified: false,
          },
        });
        byEmail.set(plan.email, { id: user.id, email: plan.email });
        if (plan.addresses) {
          for (const a of plan.addresses) {
            await tx.address.create({ data: { userId: user.id, ...a } as any });
          }
        }
        created++;
      }
    }
  });

  return { created, updated };
}

// Apply every order row in a single Prisma transaction. Orders match by
// orderNumber (when provided); a new orderNumber (or no orderNumber) creates
// the order, an existing one updates it. The customer email is resolved to a
// user (created with a placeholder password if missing). Line items resolve
// products by SKU (and optionally a variant SKU); the shipping address is
// created on the customer and linked to the order. Amounts default to the
// provided values, falling back to a computed subtotal / total.
async function executeOrders(rawRows: Record<string, unknown>[]): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  await prisma.$transaction(async (tx) => {
    const users = await tx.user.findMany({ where: {}, select: { id: true, email: true } });
    const userByEmail = new Map<string, { id: string; email: string }>(users.map((u) => [u.email.toLowerCase(), u]));
    const orders = await tx.order.findMany({ where: {}, select: { id: true, orderNumber: true } });
    const orderByNumber = new Map(orders.map((o) => [o.orderNumber, o]));
    const products = await tx.product.findMany({ select: { id: true, sku: true } });
    const productBySku = new Map(products.map((p) => [p.sku, p]));
    const variants = await tx.variant.findMany({ select: { id: true, sku: true, productId: true } });
    const variantBySku = new Map(variants.map((v) => [v.sku, v]));

    const password = await bcrypt.hash(randomImportedPassword(), BCRYPT_ROUNDS);

    for (let i = 0; i < rawRows.length; i++) {
      const rowNo = i + 1;
      const plan: OrderPlan = mapOrderRow(rawRows[i]);
      if (plan.errors.length > 0) throw new RowError(rowNo, plan.orderNumber, plan.customerEmail, plan.errors);

      // Resolve (or create) the customer.
      let user = userByEmail.get(plan.customerEmail);
      if (!user) {
        const createdUser = await tx.user.create({
          data: {
            email: plan.customerEmail,
            password,
            firstName: plan.customerEmail.split('@')[0],
            lastName: '',
            phone: null,
            isActive: true,
            role: 'customer',
            isVerified: false,
          },
        });
        user = { id: createdUser.id, email: plan.customerEmail };
        userByEmail.set(plan.customerEmail, user);
      }

      // Resolve line items against product (and variant) SKUs.
      const items: any[] = [];
      let subtotal = 0;
      for (const it of plan.items ?? []) {
        const product = productBySku.get(it.sku);
        if (!product) {
          throw new RowError(rowNo, plan.orderNumber, plan.customerEmail, [`item sku \"${it.sku}\" not found`]);
        }
        let variantId: string | null = null;
        let unitPrice = it.unitPrice;
        if (it.variantSku) {
          const variant = variantBySku.get(it.variantSku);
          if (!variant || variant.productId !== product.id) {
            throw new RowError(rowNo, plan.orderNumber, plan.customerEmail, [`variant sku \"${it.variantSku}\" not found for product \"${it.sku}\"`]);
          }
          variantId = variant.id;
          if (unitPrice === undefined) {
            const vRow = await tx.variant.findUnique({ where: { id: variant.id }, select: { price: true } });
            unitPrice = Number(vRow?.price ?? 0);
          }
        } else if (unitPrice === undefined) {
          const pRow = await tx.product.findUnique({ where: { id: product.id }, select: { price: true } });
          unitPrice = Number(pRow?.price ?? 0);
        }
        const lineTotal = unitPrice! * it.quantity;
        subtotal += lineTotal;
        items.push({
          productId: product.id,
          variantId,
          quantity: it.quantity,
          unitPrice: unitPrice!,
          totalPrice: lineTotal,
        });
      }

      // Shipping address: create on the customer and link to the order.
      let shippingAddressId: string | null = null;
      if (plan.shippingAddress) {
        const addr = await tx.address.create({ data: { userId: user.id, ...plan.shippingAddress } as any });
        shippingAddressId = addr.id;
      }

      const subtotalAmount = plan.data.subtotal ?? subtotal;
      const taxAmount = plan.data.taxAmount ?? 0;
      const shippingAmount = plan.data.shippingAmount ?? 0;
      const discountAmount = plan.data.discountAmount ?? 0;
      const totalAmount = plan.data.totalAmount ?? (subtotalAmount + taxAmount + shippingAmount - discountAmount);

      const existing = plan.orderNumber ? orderByNumber.get(plan.orderNumber) : undefined;
      if (existing) {
        await tx.order.update({
          where: { id: existing.id },
          data: {
            ...plan.data,
            subtotal: subtotalAmount,
            taxAmount,
            shippingAmount,
            discountAmount,
            totalAmount,
            shippingAddressId: shippingAddressId ?? undefined,
          } as any,
        });
        await tx.orderItem.deleteMany({ where: { orderId: existing.id } });
        if (items.length > 0) {
          await tx.orderItem.createMany({ data: items.map((it) => ({ ...it, orderId: existing.id })) });
        }
        updated++;
      } else {
        const orderNumber = plan.orderNumber || `IMP-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
        const order = await tx.order.create({
          data: {
            orderNumber,
            userId: user.id,
            status: plan.data.status ?? 'pending',
            paymentStatus: plan.data.paymentStatus ?? 'pending',
            paymentMethod: plan.data.paymentMethod ?? null,
            notes: plan.data.notes ?? null,
            subtotal: subtotalAmount,
            taxAmount,
            shippingAmount,
            discountAmount,
            totalAmount,
            shippingAddressId,
            createdAt: plan.data.createdAt ?? undefined,
            items: items.length ? { create: items } : undefined,
          } as any,
        });
        orderByNumber.set(orderNumber, order);
        created++;
      }
    }
  });

  return { created, updated };
}

// Apply an import file all-or-nothing. First re-run the preview to classify
// every row; if any row is an error, nothing is written and the error rows
// are returned so the admin can fix the file. Otherwise execute the rows in
// one transaction - either every row lands, or (on a RowError) the whole
// transaction rolls back and nothing is applied.
export async function commitImport(
  entity: Entity,
  format: ImportFormat,
  text: string,
  opts: { resolveImage?: ImageUrlResolver } = {},
): Promise<CommitResult> {
  const preview = await previewImport(entity, format, text, opts);

  // Validation errors block the whole import (all-or-nothing).
  if (preview.summary.error > 0) {
    return {
      entity,
      total: preview.total,
      created: 0,
      updated: 0,
      failed: preview.summary.error,
      errors: preview.rows
        .filter((r) => r.status === 'error')
        .map((r) => ({ row: r.row, sku: r.sku, name: r.name, errors: r.errors })),
    };
  }

  const rawRows = extractRows(entity, format, text);
  try {
    let result: { created: number; updated: number };
    if (entity === 'products') result = await executeProducts(rawRows, opts);
    else if (entity === 'categories') result = await executeCategories(rawRows);
    else if (entity === 'customers') result = await executeCustomers(rawRows);
    else result = await executeOrders(rawRows);
    return { entity, total: preview.total, created: result.created, updated: result.updated, failed: 0, errors: [] };
  } catch (err) {
    if (err instanceof RowError) {
      // The transaction rolled back: NOTHING from this file was applied.
      return {
        entity,
        total: preview.total,
        created: 0,
        updated: 0,
        failed: 1,
        errors: [{ row: err.row, sku: err.sku, name: err.rowName, errors: err.rowErrors }],
      };
    }
    throw err;
  }
}
