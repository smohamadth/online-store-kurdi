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
import { prisma } from '../../config/database';
import {
  extractRows,
  mapCategoryRow,
  mapProductRow,
  previewImport,
  type CategoryPlan,
  type Entity,
  type ImportFormat,
  type ProductPlan,
} from './mappers';

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
  await tx.variant.deleteMany({ where: { productId } });
  for (const v of variants) {
    await tx.variant.create({
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

async function executeProducts(
  rawRows: Record<string, unknown>[],
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  await prisma.$transaction(async (tx) => {
    // Fetch the (small) reference data once and match in memory.
    const cats = await tx.category.findMany({ select: { id: true, name: true, slug: true } });
    const catIndex = new CiIndex(cats);
    const products = await tx.product.findMany({ select: { id: true, slug: true, sku: true } });
    const bySku = new Map(products.map((p) => [p.sku, p]));
    const slugsTaken = new Set(products.map((p) => p.slug));

    for (let i = 0; i < rawRows.length; i++) {
      const rowNo = i + 1;
      const plan = mapProductRow(rawRows[i], null);
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
        const slug = await uniqueProductSlug(tx, plan.name ?? '', plan.data.slug, slugsTaken);
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
          // sku only lives on plan.sku (it is the match key, not an
          // updatable field) - without it the create violates the
          // schema's required, unique column.
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

async function executeCategories(
  rawRows: Record<string, unknown>[],
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  await prisma.$transaction(async (tx) => {
    const cats = await tx.category.findMany({ select: { id: true, name: true, slug: true } });
    const index = new CiIndex(cats);

    for (let i = 0; i < rawRows.length; i++) {
      const rowNo = i + 1;
      const plan: CategoryPlan = mapCategoryRow(rawRows[i]);
      if (plan.errors.length > 0) {
        throw new RowError(rowNo, undefined, plan.name, plan.errors);
      }

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
        if (parentId !== undefined) {
          // parent check for a brand-new category: parentId can't equal an
          // id that doesn't exist yet, so nothing extra to guard.
        }
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

export async function commitImport(
  entity: Entity,
  format: ImportFormat,
  text: string,
): Promise<CommitResult> {
  const preview = await previewImport(entity, format, text);

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
    const { created, updated } =
      entity === 'products' ? await executeProducts(rawRows) : await executeCategories(rawRows);
    return { entity, total: preview.total, created, updated, failed: 0, errors: [] };
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
