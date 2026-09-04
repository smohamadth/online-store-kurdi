/**
 * Bulk import/export routes (admin & manager).
 *
 *   GET  /api/import-export/export/:entity?format=csv|json&sample=1
 *         Entity file download (products | categories | customers | orders).
 *         `sample=1` returns a template: header + one example row.
 *   POST /api/import-export/preview   { entity, format, text }
 *         Parse + validate, classify each row (create/update/error).
 *         Writes nothing.
 *   POST /api/import-export/commit    { entity, format, text }
 *         All-or-nothing: if any row fails validation nothing is
 *         written; otherwise every row is applied in one transaction.
 *   POST /api/import-export/import    (multipart: file + images*, action)
 *         Same as preview/commit but accepts the data file plus attached
 *         image files. A product row's `images` column may reference an
 *         attached file as `@file:<original filename>`, which is uploaded
 *         and resolved to its served URL before the rows are applied.
 *
 * For the plain preview/commit endpoints the raw file text is sent in the
 * JSON body (not multipart) because the file is parsed, not stored - the
 * admin pastes/uploads in the browser, the API never keeps a copy.
 */
import { Router } from 'express';
import multer from 'multer';
import { authenticate, authorize } from '../../middleware/auth';
import { logger } from '../../utils/logger';
import { prisma } from '../../config/database';
import { uploadImage, deleteImage } from '../../services/storage.service';
import {
  CATEGORY_CSV_HEADERS,
  CUSTOMER_CSV_HEADERS,
  ORDER_CSV_HEADERS,
  PRODUCT_CSV_HEADERS,
  ValidationError,
  previewImport,
  serializeCsvFile,
  type Entity,
  type ImageUrlResolver,
  type ImportFormat,
} from './mappers';
import { commitImport } from './commit';

const router = Router();

router.use(authenticate, authorize('admin', 'manager'));

const ENTITIES: Entity[] = ['products', 'categories', 'customers', 'orders'];
const FORMATS: ImportFormat[] = ['csv', 'json'];

// Multipart parsing for the image-carrying import endpoint below. Image files
// are held in RAM (memoryStorage), handed to storage.service (sharp -> webp
// variants), and the `@file:<name>` placeholders in the products file are
// resolved to the returned URLs before the rows are applied.
const memory = multer.memoryStorage();
const multipart = multer({
  storage: memory,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per image (mirrors upload.routes.ts)
    files: 20,
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (file.fieldname === 'file') return cb(null, true); // the data file
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`File type ${file.mimetype} is not allowed`));
  },
});

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
function parseJsonSafe(raw: unknown, fallback: any) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}

function serializeVariant(v: any) {
  const optionValues = (v.optionValues ?? []).map((ov: any) => ({
    option: ov.optionValue?.option?.name ?? '',
    value: ov.optionValue?.value ?? '',
    swatch: ov.optionValue?.swatch ?? null,
  })).filter((ov: any) => ov.option || ov.value);
  const images = (v.images ?? []).map((im: any) => ({
    url: im.url,
    alt: im.alt ?? '',
    isPrimary: im.isPrimary,
  }));
  return {
    name: v.name,
    sku: v.sku,
    slug: v.slug ?? '',
    price: v.price,
    compareAtPrice: v.compareAtPrice ?? '',
    quantity: v.quantity,
    attributes: parseJsonSafe(v.attributes, {}),
    isActive: v.isActive,
    sortOrder: v.sortOrder,
    optionValues,
    images,
  };
}

async function exportProductsRows(): Promise<Record<string, any>[]> {
  const products = await prisma.product.findMany({
    orderBy: [{ createdAt: 'asc' }],
    include: {
      category: { select: { name: true } },
      options: { orderBy: [{ sortOrder: 'asc' }], include: { values: { orderBy: [{ sortOrder: 'asc' }] } } },
      variants: {
        orderBy: [{ sortOrder: 'asc' }],
        include: {
          images: { orderBy: [{ sortOrder: 'asc' }] },
          optionValues: { include: { optionValue: { include: { option: true } } } },
        },
      },
      images: { orderBy: [{ sortOrder: 'asc' }] },
    },
  });
  return products.map((p) => {
    const variants = (p.variants ?? []).map(serializeVariant);
    const options = (p.options ?? []).map((o) => ({
      name: o.name,
      values: (o.values ?? []).map((val) => val.value),
    }));
    return {
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
    options,
    variants,
    // Spreadsheet-friendly flatten so Excel users see SKUs without opening JSON.
    variantSkus: variants.map((v) => v.sku).join(' | '),
    variantNames: variants.map((v) => v.name).join(' | '),
    variantPrices: variants.map((v) => String(v.price)).join(' | '),
    variantQuantities: variants.map((v) => String(v.quantity ?? 0)).join(' | '),
    variantOptions: variants.map((v) =>
      (v.optionValues.length
        ? v.optionValues.map((ov: any) => `${ov.option}:${ov.value}`).join(', ')
        : Object.entries(v.attributes || {}).map(([k, val]) => `${k}:${val}`).join(', ')),
    ).join(' | '),
  };
  });
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

// Fetch every customer (role: customer) with their addresses, and shape each
// into a flat export row. Addresses travel as a JSON array (native in JSON
// exports, JSON-encoded string in CSV).
async function exportCustomersRows(): Promise<Record<string, any>[]> {
  const users = await prisma.user.findMany({
    where: { role: 'customer' },
    orderBy: { createdAt: 'asc' },
    include: { addresses: { orderBy: { createdAt: 'asc' } } },
  });
  return users.map((u) => ({
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    phone: nullIfEmpty(u.phone),
    isActive: u.isActive,
    addresses: (u.addresses ?? []).map((a) => ({
      firstName: a.firstName,
      lastName: a.lastName,
      address1: a.address1,
      city: a.city,
      state: a.state,
      postalCode: a.postalCode,
      country: a.country,
      phone: a.phone ?? '',
      type: a.type,
    })),
  }));
}

// Fetch every order with its customer email, line items (by SKU) and shipping
// address, and shape each into a flat export row.
async function exportOrdersRows(): Promise<Record<string, any>[]> {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      user: { select: { email: true } },
      items: { include: { product: { select: { sku: true } }, variant: { select: { sku: true } } } },
      shippingAddress: true,
    },
  });
  return orders.map((o) => ({
    orderNumber: o.orderNumber,
    customerEmail: o.user?.email ?? '',
    status: o.status,
    subtotal: o.subtotal,
    taxAmount: o.taxAmount,
    shippingAmount: o.shippingAmount,
    discountAmount: o.discountAmount,
    totalAmount: o.totalAmount,
    paymentMethod: nullIfEmpty(o.paymentMethod),
    paymentStatus: o.paymentStatus,
    notes: nullIfEmpty(o.notes),
    items: (o.items ?? []).map((it) => ({
      sku: it.product?.sku ?? '',
      variantSku: it.variant?.sku ?? '',
      quantity: it.quantity,
      unitPrice: it.unitPrice,
    })),
    shippingFirstName: o.shippingAddress?.firstName ?? '',
    shippingLastName: o.shippingAddress?.lastName ?? '',
    shippingAddress1: o.shippingAddress?.address1 ?? '',
    shippingCity: o.shippingAddress?.city ?? '',
    shippingState: o.shippingAddress?.state ?? '',
    shippingPostalCode: o.shippingAddress?.postalCode ?? '',
    shippingCountry: o.shippingAddress?.country ?? '',
    shippingPhone: o.shippingAddress?.phone ?? '',
    createdAt: o.createdAt ? o.createdAt.toISOString() : '',
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
  options: [{ name: 'Size', values: ['L'] }],
  variants: [{ name: 'Large', sku: 'SKU-0001-L', price: 34.99, quantity: 20, attributes: { size: 'L' }, optionValues: [{ option: 'Size', value: 'L' }], images: [] }],
  variantSkus: 'SKU-0001-L',
  variantNames: 'Large',
  variantPrices: '34.99',
  variantQuantities: '20',
  variantOptions: 'Size:L',
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

const SAMPLE_CUSTOMER: Record<string, any> = {
  email: 'customer@example.com',
  firstName: 'Jane',
  lastName: 'Doe',
  phone: '',
  isActive: true,
  addresses: [{ firstName: 'Jane', lastName: 'Doe', address1: '1 Main St', city: 'New York', state: 'NY', postalCode: '10001', country: 'US', phone: '', type: 'shipping' }],
};

const SAMPLE_ORDER: Record<string, any> = {
  orderNumber: 'ORD-SAMPLE-1',
  customerEmail: 'customer@example.com',
  status: 'delivered',
  subtotal: 49.99,
  taxAmount: 5.0,
  shippingAmount: 0,
  discountAmount: 0,
  totalAmount: 54.99,
  paymentMethod: 'bank_transfer',
  paymentStatus: 'completed',
  notes: '',
  items: [{ sku: 'SKU-0001', variantSku: '', quantity: 1, unitPrice: 49.99 }],
  shippingFirstName: 'Jane',
  shippingLastName: 'Doe',
  shippingAddress1: '1 Main St',
  shippingCity: 'New York',
  shippingState: 'NY',
  shippingPostalCode: '10001',
  shippingCountry: 'US',
  shippingPhone: '',
  createdAt: '',
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
        : entity === 'categories'
          ? sample ? [SAMPLE_CATEGORY] : await exportCategoriesRows()
          : entity === 'customers'
            ? sample ? [SAMPLE_CUSTOMER] : await exportCustomersRows()
            : sample ? [SAMPLE_ORDER] : await exportOrdersRows();

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

    const headers =
      entity === 'products' ? PRODUCT_CSV_HEADERS
      : entity === 'categories' ? CATEGORY_CSV_HEADERS
      : entity === 'customers' ? CUSTOMER_CSV_HEADERS
      : ORDER_CSV_HEADERS;
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

// ---------------------------------------------------------------------------
// import with image uploads (multipart)
// ---------------------------------------------------------------------------
//
// Same as the JSON `preview` / `commit` endpoints, but the admin can attach
// the actual image files alongside the data file. A product row's `images`
// column may then reference an attached file as `@file:<original filename>`;
// the server uploads the image (sharp -> webp variants via storage.service),
// resolves the placeholder to the served URL, and applies the rows.
//
// Form fields:
//   entity   - products | categories | customers | orders
//   format   - csv | json
//   action   - preview | commit
//   file     - the data file (CSV/JSON text)
//   images*  - zero or more image files (field name `images`)
//
// Image cleanup: uploaded files that are NOT committed (a preview, or a
// commit that rolled back) are deleted so they don't orphan in /uploads.
router.post('/import', multipart.fields([{ name: 'file', maxCount: 1 }, { name: 'images', maxCount: 20 }]), async (req, res, next) => {
  const uploaded: { id: string; folder: string }[] = [];
  const uploadedNameToUrl = new Map<string, string>(); // originalName -> served URL
  const folder = 'products';
  try {
    const files = (req.files as any) || {};
    const dataFile = (files.file?.[0] as Express.Multer.File) || undefined;
    const images = (files.images || []) as Express.Multer.File[];

    const entity = String(req.body?.entity || '') as Entity;
    const format = String(req.body?.format || '') as ImportFormat;
    const action = String(req.body?.action || 'commit');
    if (!ENTITIES.includes(entity)) throw new ValidationError(`entity must be one of ${ENTITIES.join(', ')}`);
    if (!FORMATS.includes(format)) throw new ValidationError(`format must be one of ${FORMATS.join(', ')}`);
    if (action !== 'preview' && action !== 'commit') throw new ValidationError(`action must be preview or commit`);

    let text: string;
    if (dataFile) {
      text = dataFile.buffer.toString('utf-8');
    } else if (typeof req.body?.text === 'string' && req.body.text) {
      text = req.body.text;
    } else {
      throw new ValidationError('text is required (paste contents or upload the data file)');
    }

    // Upload every attached image and build filename -> URL resolver.
    const resolveImage: ImageUrlResolver = (token) => {
      const url = uploadedNameToUrl.get(token);
      return url;
    };
    for (const f of images) {
      const result = await uploadImage(f.buffer, f.originalname, f.mimetype, folder);
      uploaded.push({ id: result.id, folder });
      // First occurrence of a filename wins; duplicate names in the file map
      // to the same upload.
      if (!uploadedNameToUrl.has(f.originalname)) uploadedNameToUrl.set(f.originalname, result.originalUrl);
    }

    const preview = action === 'preview';
    const result =
      preview
        ? await previewImport(entity, format, text, { resolveImage })
        : await commitImport(entity, format, text, { resolveImage });

    // Clean up images that weren't committed (preview, or a commit that
    // rolled back) so /uploads doesn't fill with orphans.
    const commit = preview ? undefined : (result as any);
    if (preview || (commit && commit.failed > 0)) {
      for (const up of uploaded) {
        try { await deleteImage(up.folder, up.id); } catch { /* best-effort */ }
      }
    }

    if (!preview && commit) {
      logger.info(
        `Import ${entity} (${format}, ${images.length} image${images.length === 1 ? '' : 's'}): ${commit.created} created, ${commit.updated} updated, ${commit.failed} failed of ${commit.total}`,
      );
    }
    res.json({ status: 'success', data: result });
  } catch (err) {
    // A failed multipart import should not leave its uploaded images behind.
    for (const up of uploaded) {
      try { await deleteImage(up.folder, up.id); } catch { /* best-effort */ }
    }
    if (err instanceof ValidationError) {
      res.status(400).json({ status: 'error', message: err.message });
      return;
    }
    next(err);
  }
});

export default router;
