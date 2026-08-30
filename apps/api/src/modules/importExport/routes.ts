/**
 * Bulk import/export routes (admin & manager).
 *
 *   GET  /api/import-export/export/:entity?format=csv|json&sample=1
 *         Entity file download (products | categories). `sample=1`
 *         returns a template: header + one example row.
 *   POST /api/import-export/preview   { entity, format, text }
 *         Parse + validate, classify each row (create/update/error).
 *         Writes nothing.
 *   POST /api/import-export/commit    { entity, format, text }
 *         All-or-nothing: if any row fails validation nothing is
 *         written; otherwise every row is applied in one transaction.
 *
 * The raw file text is sent in the JSON body (not multipart) because
 * the file is parsed, not stored - the admin pastes/uploads in the
 * browser, the API never keeps a copy.
 */
import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { logger } from '../../utils/logger';
import { prisma } from '../../config/database';
import {
  CATEGORY_CSV_HEADERS,
  PRODUCT_CSV_HEADERS,
  ValidationError,
  previewImport,
  serializeCsvFile,
  type Entity,
  type ImportFormat,
} from './mappers';
import { commitImport } from './commit';

const router = Router();

router.use(authenticate, authorize('admin', 'manager'));

const ENTITIES: Entity[] = ['products', 'categories'];
const FORMATS: ImportFormat[] = ['csv', 'json'];

// Validate the preview/commit request body. The file contents are sent as a
// JSON `text` field (not a multipart upload) because the file is parsed, not
// stored - the admin pastes/uploads in the browser, the API never keeps a copy.
function parseBody(body: any): { entity: Entity; format: ImportFormat; text: string } {
  const entity = body?.entity;
  const format = body?.format;
  const text = body?.text;
  if (!ENTITIES.includes(entity)) throw new ValidationError(`entity must be one of ${ENTITIES.join(', ')}`);
  if (!FORMATS.includes(format)) throw new ValidationError(`format must be one of ${FORMATS.join(', ')}`);
  if (typeof text !== 'string') throw new ValidationError('text is required (the file contents)');
  return { entity, format, text };
}

// ---------------------------------------------------------------------------
// export
// ---------------------------------------------------------------------------

const nullIfEmpty = (v: unknown) => (v === null || v === undefined || v === '' ? null : v);

// Fetch every product (oldest first) with its category name, variants and
// images, and shape each into a flat export row. Nested collections
// (variants, images) become native arrays in JSON exports and JSON-encoded
// strings in CSV (the importer accepts both).
async function exportProductsRows(): Promise<Record<string, any>[]> {
  const products = await prisma.product.findMany({
    orderBy: [{ createdAt: 'asc' }],
    include: {
      category: { select: { name: true } },
      variants: { orderBy: [{ sortOrder: 'asc' }] },
      images: { orderBy: [{ sortOrder: 'asc' }] },
    },
  });
  return products.map((p) => ({
    name: p.name,
    sku: p.sku,
    slug: p.slug,
    description: p.description,
    shortDescription: nullIfEmpty(p.shortDescription),
    type: p.type,
    status: p.status,
    price: p.price,
    compareAtPrice: p.compareAtPrice,
    costPrice: p.costPrice,
    trackInventory: p.trackInventory,
    quantity: p.quantity,
    lowStockThreshold: p.lowStockThreshold,
    allowBackorder: p.allowBackorder,
    backorderLimit: p.backorderLimit,
    expectedRestockAt: p.expectedRestockAt ? p.expectedRestockAt.toISOString() : '',
    downloadUrl: p.downloadUrl,
    downloadLimit: p.downloadLimit,
    downloadExpiry: p.downloadExpiry,
    weight: p.weight,
    weightUnit: p.weightUnit,
    dimensions: p.dimensions,
    category: p.category?.name ?? '',
    metaTitle: p.metaTitle,
    metaDescription: p.metaDescription,
    metaKeywords: p.metaKeywords || '[]',
    // Nested collections travel as native values in JSON exports and as
    // JSON strings in CSV (the importer accepts both).
    images: (p.images ?? []).map((im) => ({
      url: im.url,
      alt: im.alt ?? '',
      isPrimary: im.isPrimary,
    })),
    variants: (p.variants ?? []).map((v) => ({
      name: v.name,
      sku: v.sku,
      slug: v.slug ?? '',
      price: v.price,
      compareAtPrice: v.compareAtPrice ?? '',
      quantity: v.quantity,
      attributes: v.attributes && v.attributes !== '{}' ? JSON.parse(v.attributes) : {},
      isActive: v.isActive,
      sortOrder: v.sortOrder,
    })),
  }));
}

// Fetch every category (by sort order, then name) with its parent's name,
// and shape each into a flat export row.
async function exportCategoriesRows(): Promise<Record<string, any>[]> {
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { parent: { select: { name: true } } },
  });
  return categories.map((c) => ({
    name: c.name,
    slug: c.slug,
    description: c.description ?? '',
    image: c.image ?? '',
    parent: c.parent?.name ?? '',
    isActive: c.isActive,
    sortOrder: c.sortOrder,
  }));
}

const SAMPLE_PRODUCT: Record<string, any> = {
  name: 'Sample Product',
  sku: 'SKU-0001',
  slug: '',
  description: 'A short description shown on the product page.',
  shortDescription: 'One line for cards and lists.',
  type: 'physical',
  status: 'active',
  price: 29.99,
  compareAtPrice: 39.99,
  costPrice: '',
  trackInventory: true,
  quantity: 50,
  lowStockThreshold: 5,
  allowBackorder: false,
  backorderLimit: '',
  expectedRestockAt: '',
  downloadUrl: '',
  downloadLimit: '',
  downloadExpiry: '',
  weight: 0.5,
  weightUnit: 'kg',
  dimensions: '{"length":10,"width":5,"height":2,"unit":"cm"}',
  category: 'General',
  metaTitle: '',
  metaDescription: '',
  metaKeywords: 'sample, example',
  images: [{ url: '/images/products/sample.jpg', alt: 'Sample product', isPrimary: true }],
  variants: [{ name: 'Large', sku: 'SKU-0001-L', price: 34.99, quantity: 20, attributes: { size: 'L' } }],
};

const SAMPLE_CATEGORY: Record<string, any> = {
  name: 'Sample Category',
  slug: 'sample-category',
  description: 'A category description.',
  image: '',
  parent: '',
  isActive: true,
  sortOrder: 0,
};

// Download an entity's data as a file (CSV or JSON). `?sample=1` returns a
// one-row template instead of the full data, so the admin can fill it in.
router.get('/export/:entity', async (req, res, next) => {
  try {
    const entity = req.params.entity as Entity;
    if (!ENTITIES.includes(entity)) {
      res.status(400).json({ status: 'error', message: `entity must be one of ${ENTITIES.join(', ')}` });
      return;
    }
    const format = (req.query.format as string) || 'csv';
    if (!FORMATS.includes(format as ImportFormat)) {
      res.status(400).json({ status: 'error', message: `format must be csv or json` });
      return;
    }
    const sample = req.query.sample === '1' || req.query.sample === 'true';

    const rows =
      entity === 'products'
        ? sample ? [SAMPLE_PRODUCT] : await exportProductsRows()
        : sample ? [SAMPLE_CATEGORY] : await exportCategoriesRows();

    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = sample ? 'template' : 'export';

    if (format === 'json') {
      // Wrap the rows in a small envelope (entity + timestamp + count) so the
      // importer can tell which entity the array is and when it was exported.
      const payload = {
        entity,
        exportedAt: new Date().toISOString(),
        count: rows.length,
        [entity]: rows,
      };
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${entity}-${suffix}-${stamp}.json"`);
      res.send(JSON.stringify(payload, null, 2));
      return;
    }

    const headers = entity === 'products' ? PRODUCT_CSV_HEADERS : CATEGORY_CSV_HEADERS;
    // Build a header row + one row per record. Null/undefined cells become
    // empty strings; objects/arrays (variants, images, dimensions) are
    // JSON-encoded into a single CSV cell (the importer decodes them back).
    const matrix = [
      headers,
      ...rows.map((row) =>
        headers.map((h) => {
          const v = row[h];
          if (v === null || v === undefined) return '';
          if (typeof v === 'object') return JSON.stringify(v);
          return v;
        }),
      ),
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${entity}-${suffix}-${stamp}.csv"`);
    res.send(serializeCsvFile(matrix));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// preview + commit
// ---------------------------------------------------------------------------

// Dry run: parse + validate the file and classify each row as create /
// update / error. Writes nothing - the admin reviews the result before
// committing. Returns a 400 (not 500) for a malformed file.
router.post('/preview', async (req, res, next) => {
  try {
    const { entity, format, text } = parseBody(req.body);
    const result = await previewImport(entity, format, text);
    res.json({ status: 'success', data: result });
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ status: 'error', message: err.message });
      return;
    }
    next(err);
  }
});

// Apply the file for real (all-or-nothing). The server re-validates the raw
// text - the client's preview is a convenience, not a contract. Logs a
// summary of what was created/updated/failed.
router.post('/commit', async (req, res, next) => {
  try {
    const { entity, format, text } = parseBody(req.body);
    const result = await commitImport(entity, format, text);
    logger.info(
      `Import ${entity} (${format}): ${result.created} created, ${result.updated} updated, ${result.failed} failed of ${result.total}`,
    );
    res.json({ status: 'success', data: result });
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ status: 'error', message: err.message });
      return;
    }
    next(err);
  }
});

export default router;
