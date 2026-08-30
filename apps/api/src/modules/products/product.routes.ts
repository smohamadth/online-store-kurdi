// ---------------------------------------------------------------------------
// The product API (the LIVE implementation).
//
// Mounted at /api/products. Public read paths (list, facets, featured,
// search, by id, by slug, related) + admin/manager write paths (create,
// update, delete-as-archive).
//
// Listing/facets go through productFilter.service.ts (multi-select
// categories, attribute filters, onSale, minRating); everything else is
// inline Prisma in this file. Note product.controller.ts /
// product.service.ts are an earlier split that is NOT wired in - this
// file is what to change.
//
// Conventions: description is sanitised on write (stored-XSS guard, see
// sanitizeDescription), `dimensions`/`metaKeywords` are JSON-string
// columns on the SQLite schema, and delete is soft (status -> 'archived').
// ---------------------------------------------------------------------------
import { Router } from 'express';
import { authenticate, authorize, optionalAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validation';
import { prisma } from '../../config/database';
import { cache } from '../../config/redis';
import { logger } from '../../utils/logger';
import { NotFoundError, ConflictError, AppError } from '../../middleware/errorHandler';
import slugify from 'slugify';
import { z } from 'zod';
import { listProducts, getFacets, parseFilterFromQuery } from './productFilter.service';
import { syncVariantAttributes } from './variantAttributeIndex';
import { AnalyticsService } from '../analytics/analytics.service';

const router = Router();
const analyticsService = new AnalyticsService();

// Validation schemas
const createProductSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).optional(),
  description: z.string().min(1),
  shortDescription: z.string().optional().nullable(),
  sku: z.string().min(1).max(100),
  type: z.enum(['physical', 'digital']).default('physical'),
  status: z.enum(['draft', 'active', 'inactive', 'archived']).default('active'),  // Changed to active
  price: z.number().positive(),
  compareAtPrice: z.number().positive().optional().nullable(),
  costPrice: z.number().positive().optional().nullable(),
  trackInventory: z.boolean().default(true),
  quantity: z.number().int().min(0).default(0),
  lowStockThreshold: z.number().int().min(0).default(10),
  downloadUrl: z.string().optional().nullable(),
  downloadLimit: z.number().int().positive().optional().nullable(),
  downloadExpiry: z.number().int().positive().optional().nullable(),
  weight: z.number().positive().optional().nullable(),
  weightUnit: z.enum(['kg', 'lb', 'oz', 'g']).default('kg'),
  dimensions: z.any().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  metaTitle: z.string().max(255).optional().nullable(),
  metaDescription: z.string().max(500).optional().nullable(),
  // Stored as a JSON string column. Accept an array or a string from the
  // client and always normalise to a string before it reaches Prisma;
  // passing the raw array made every product create/update fail with a 500.
  metaKeywords: z
    .union([z.array(z.string()), z.string()])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      return typeof v === 'string' ? v : JSON.stringify(v);
    }),
  images: z.array(z.any()).default([]),
  variants: z.array(z.any()).default([]),
});

const updateProductSchema = createProductSchema.partial();


/**
 * Server-side sanitiser for product descriptions.
 *
 * The admin editor sanitises as you type, but a client can POST anything
 * directly to the API. Since the storefront renders this HTML, stripping
 * scripts and event handlers here is what actually prevents stored XSS.
 */
const ALLOWED_TAGS = [
  'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike',
  'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'blockquote', 'a', 'span', 'div',
];

function sanitizeDescription(html: string): string {
  if (!html) return html;

  let out = html
    // Drop whole dangerous elements including their contents.
    .replace(/<\s*(script|style|iframe|object|embed|form|input|link|meta)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|form|input|link|meta)\b[^>]*\/?>/gi, '')
    // Inline event handlers: onclick=, onerror=, ...
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // javascript:/data: URLs
    .replace(/(href|src)\s*=\s*("|')\s*(javascript|data)\s*:[^"']*\2/gi, '$1="#"');

  // Remove any tag outside the allow-list, keeping inner text.
  out = out.replace(/<\/?([a-zA-Z0-9]+)\b[^>]*>/g, (match, tag) =>
    ALLOWED_TAGS.includes(String(tag).toLowerCase()) ? match : ''
  );

  return out.trim();
}

const productQuerySchema = z.object({
  page: z.string().transform(Number).default('1'),
  limit: z.string().transform(Number).default('20'),
  category: z.string().optional(),
  type: z.enum(['physical', 'digital']).optional(),
  status: z.enum(['draft', 'active', 'inactive', 'archived']).optional(),
  minPrice: z.string().transform(Number).optional(),
  maxPrice: z.string().transform(Number).optional(),
  search: z.string().optional(),
  sort: z.enum(['price_asc', 'price_desc', 'name_asc', 'name_desc', 'newest', 'popular']).default('newest'),
  inStock: z.string().transform(v => v === 'true').optional(),
});

// Helper function to format product response
function formatProduct(product: any) {
  const ratings = product.reviews?.map((r: any) => r.rating) || [];
  const averageRating = ratings.length > 0
    ? ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length
    : 0;

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    shortDescription: product.shortDescription,
    sku: product.sku,
    type: product.type,
    status: product.status,
    price: Number(product.price),
    compareAtPrice: product.compareAtPrice ? Number(product.compareAtPrice) : null,
    quantity: product.quantity,
    // Physical-product shipping attributes. Exposed so the storefront
    // can compute weight-based shipping at checkout (see ShippingSelector).
    // `null` when the product has no weight configured.
    weight: product.weight != null ? Number(product.weight) : null,
    weightUnit: product.weightUnit ?? 'kg',
    images: product.images?.map((img: any) => ({
      id: img.id,
      url: img.url,
      alt: img.alt,
      isPrimary: img.isPrimary,
      sortOrder: img.sortOrder,
    })) || [],
    category: product.category ? {
      id: product.category.id,
      name: product.category.name,
      slug: product.category.slug,
      image: product.category.image,
    } : null,
    variants: product.variants?.map((v: any) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      price: Number(v.price),
      quantity: v.quantity,
      attributes: v.attributes,
      isActive: v.isActive,
    })) || [],
    averageRating: Math.round(averageRating * 10) / 10,
    reviewCount: ratings.length,
    // Digital-product fields. Returned on every product so the
    // storefront doesn't have to branch on `type` before deciding
    // which fields to render. `null` for physical products.
    downloadUrl: product.downloadUrl ?? null,
    downloadLimit: product.downloadLimit ?? null,
    downloadExpiry: product.downloadExpiry ?? null,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

// GET /api/products - Get products with filtering and pagination
//
// The original implementation accepted a single category string, a single
// type, and a single min/max price. The storefront now needs multi-select
// categories, attribute filters, an `onSale` flag, and a `minRating`
// threshold. The new filter service lives in `./productFilter.service.ts`
// and exposes the same response shape (status / data / pagination) so
// the old callers keep working.
/**
 * Pre-process the query so `?attr.size=M&attr.color=red` becomes
 * `req.query = { attr: { size: 'M', color: 'red' } }`. Express's `qs`
 * parser only does this for bracket notation (`attr[size]=M`), and we
 * want dot notation because it's what most REST clients emit.
 */
function flattenAttrQuery(qs: any): any {
  if (!qs || typeof qs !== 'object') return qs;
  const attr: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(qs)) {
    if (k.startsWith('attr.')) {
      const sub = k.slice(5);
      attr[sub] = v as any;
      delete qs[k];
    }
  }
  if (Object.keys(attr).length > 0) {
    qs.attr = attr;
  }
  return qs;
}

router.get('/', async (req, res, next) => {
  try {
    const query = flattenAttrQuery({ ...req.query });
    const filter = parseFilterFromQuery(query);
    const result = await listProducts(filter);
    res.json({
      status: 'success',
      data: result.data.map(formatProduct),
      pagination: result.pagination,
      applied: {
        category: result.applied.category,
        type: result.applied.type,
        attr: result.applied.attr,
        minPrice: result.applied.minPrice,
        maxPrice: result.applied.maxPrice,
        inStock: result.applied.inStock,
        onSale: result.applied.onSale,
        minRating: result.applied.minRating,
        optionValueId: (result.applied as any).optionValueId,
        sort: result.applied.sort,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/products/facets - Get facet counts for the filter sidebar.
//
// The sidebar needs to know, for each candidate value, how many products
// would match if the user added it. The counts are computed against
// every other active filter so the UI updates as the user clicks
// checkboxes. See the service's `getFacets` for the exact semantics.
router.get('/facets', async (req, res, next) => {
  try {
    const query = flattenAttrQuery({ ...req.query });
    const filter = parseFilterFromQuery(query);
    const facets = await getFacets(filter);
    res.json({
      status: 'success',
      data: facets,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/products/featured - Get featured products
router.get('/featured', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;

    const products = await prisma.product.findMany({
      where: { status: 'active' },
      include: {
        images: true,
        category: true,
        variants: true,
        reviews: { select: { rating: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json({
      status: 'success',
      data: products.map(formatProduct),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/products/search - Search products
router.get('/search', async (req, res, next) => {
  try {
    const { q, limit } = req.query;
    const searchLimit = parseInt(limit as string) || 10;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Search query is required',
      });
    }

    // No `mode: 'insensitive'`: SQLite provider rejects it.
    const products = await prisma.product.findMany({
      where: {
        status: 'active',
        OR: [
          { name: { contains: q } },
          { description: { contains: q } },
          { sku: { contains: q } },
        ],
      },
      include: {
        images: true,
        category: true,
        variants: true,
        reviews: { select: { rating: true } },
      },
      take: searchLimit,
    });

    // Track the search (feeds /api/analytics/search). No-op unless the
    // store opted in with ANALYTICS_TRACKING_ENABLED - off by default,
    // and the /privacy page says exactly that.
    if (process.env.ANALYTICS_TRACKING_ENABLED === 'true') {
      await analyticsService.trackEvent({
        userId: req.user?.id,
        sessionId: (req.headers['x-session-id'] as string) || 'anonymous',
        eventType: 'search',
        searchQuery: q,
        metadata: { resultsCount: products.length },
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip,
      });
    }

    res.json({
      status: 'success',
      data: products.map(formatProduct),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/products/:id - Get product by ID
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        images: true,
        category: true,
        variants: true,
        reviews: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!product) {
      throw new NotFoundError('Product');
    }

    res.json({
      status: 'success',
      data: formatProduct(product),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/products/slug/:slug - Get product by slug
router.get('/slug/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;

    const product = await prisma.product.findUnique({
      where: { slug },
      include: {
        images: true,
        category: true,
        variants: true,
        reviews: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!product) {
      throw new NotFoundError('Product');
    }

    res.json({
      status: 'success',
      data: formatProduct(product),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/products/:id/related - Get related products
router.get('/:id/related', async (req, res, next) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit as string) || 6;

    const product = await prisma.product.findUnique({
      where: { id },
      select: { categoryId: true },
    });

    if (!product) {
      throw new NotFoundError('Product');
    }

    const products = await prisma.product.findMany({
      where: {
        categoryId: product.categoryId,
        status: 'active',
        id: { not: id },
      },
      include: {
        images: true,
        category: true,
        variants: true,
        reviews: { select: { rating: true } },
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      status: 'success',
      data: products.map(formatProduct),
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/products - Create product (admin + manager).
// A product with no categoryId lands in the default "General" category
// (created on demand - the seed also guarantees it, so this is belt and
// braces for stores that deleted it).
router.post('/', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const data = createProductSchema.parse(req.body);

    // Generate slug
    const slug = data.slug || slugify(data.name, { lower: true, strict: true });

    // Check slug uniqueness
    const existingSlug = await prisma.product.findUnique({ where: { slug } });
    if (existingSlug) {
      throw new ConflictError(`Product with slug "${slug}" already exists`);
    }

    // Check SKU uniqueness
    const existingSku = await prisma.product.findUnique({ where: { sku: data.sku } });
    if (existingSku) {
      throw new ConflictError(`Product with SKU "${data.sku}" already exists`);
    }

    // Get or create default category
    let categoryId = data.categoryId;
    if (!categoryId) {
      let defaultCategory = await prisma.category.findFirst({
        where: { slug: 'general' },
      });
      
      if (!defaultCategory) {
        defaultCategory = await prisma.category.create({
          data: {
            name: 'General',
            slug: 'general',
            description: 'General products',
          },
        });
      }
      categoryId = defaultCategory.id;
    }

    const product = await prisma.product.create({
      data: {
        ...data,
        description: sanitizeDescription(data.description),
        metaKeywords: data.metaKeywords ?? '[]',
        categoryId,
        slug,
        images: { create: data.images },
        variants: { create: data.variants },
      },
      include: {
        images: true,
        category: true,
        variants: true,
        reviews: { select: { rating: true } },
      },
    });

    // Keep the (key, value) attribute query index in step with the
    // variants created above (the /products attribute filter depends on
    // it). Re-fetched rather than read from the create payload so the
    // behaviour is identical on the mock and the real client.
    const createdVariants = await prisma.variant.findMany({
      where: { productId: product.id },
      select: { id: true, attributes: true },
    });
    for (const v of createdVariants) {
      await syncVariantAttributes(prisma, v.id, v.attributes);
    }

    logger.info(`Product created: ${product.name} (${product.id})`);

    res.status(201).json({
      status: 'success',
      data: formatProduct(product),
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/products/:id - Update product (admin only)
router.put('/:id', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = updateProductSchema.parse(req.body);

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Product');
    }

    // Check slug uniqueness
    if (data.slug && data.slug !== existing.slug) {
      const slugExists = await prisma.product.findUnique({ where: { slug: data.slug } });
      if (slugExists) {
        throw new ConflictError(`Product with slug "${data.slug}" already exists`);
      }
    }

    // Check SKU uniqueness
    if (data.sku && data.sku !== existing.sku) {
      const skuExists = await prisma.product.findUnique({ where: { sku: data.sku } });
      if (skuExists) {
        throw new ConflictError(`Product with SKU "${data.sku}" already exists`);
      }
    }

    // Extract images and variants from data (handle separately)
    const { images, variants, ...productData } = data;

    // Update product. Explicit field mapping (not `...productData`):
    // the DTO carries objects/arrays (dimensions, metaKeywords) that
    // the SQLite schema stores as JSON strings.
    const product = await prisma.product.update({
      where: { id },
      data: {
        name: productData.name,
        shortDescription: productData.shortDescription,
        sku: productData.sku,
        type: productData.type,
        status: productData.status,
        price: productData.price,
        compareAtPrice: productData.compareAtPrice,
        costPrice: productData.costPrice,
        trackInventory: productData.trackInventory,
        quantity: productData.quantity,
        lowStockThreshold: productData.lowStockThreshold,
        downloadUrl: productData.downloadUrl,
        downloadLimit: productData.downloadLimit,
        downloadExpiry: productData.downloadExpiry,
        weight: productData.weight,
        weightUnit: productData.weightUnit,
        dimensions: productData.dimensions ? JSON.stringify(productData.dimensions) : undefined,
        // categoryId is NOT NULL in the schema: null/undefined keeps the
        // existing category (same "leave as-is" rule as the other
        // non-nullable columns below).
        categoryId: productData.categoryId ?? undefined,
        metaTitle: productData.metaTitle,
        metaDescription: productData.metaDescription,
        metaKeywords: productData.metaKeywords ? JSON.stringify(productData.metaKeywords) : undefined,
        ...(productData.description !== undefined
          ? { description: sanitizeDescription(productData.description as string) }
          : {}),
        slug: data.slug || (data.name ? slugify(data.name, { lower: true, strict: true }) : undefined),
      },
      include: {
        images: true,
        category: true,
        variants: true,
        reviews: { select: { rating: true } },
      },
    });

    // Update images if provided - a full REPLACE, not a merge: sending a
    // new images array wipes the old rows and recreates, so the client
    // always has to send the complete list it wants. (Two statements, not
    // a transaction: if the createMany fails after the delete, the
    // product is left with no images rather than a partial set - a known
    // trade-off, surfaced here for the next reader.)
    if (images && Array.isArray(images)) {
      // Delete existing images
      await prisma.productImage.deleteMany({
        where: { productId: id },
      });

      // Create new images
      if (images.length > 0) {
        await prisma.productImage.createMany({
          data: images.map((img: any, index: number) => ({
            productId: id,
            url: img.url || '',
            alt: img.alt || null,
            isPrimary: img.isPrimary || index === 0,
            sortOrder: img.sortOrder || index,
          })),
        });
      }
    }

    // Fetch updated product with images
    const updatedProduct = await prisma.product.findUnique({
      where: { id },
      include: {
        images: true,
        category: true,
        variants: true,
        reviews: { select: { rating: true } },
      },
    });

    logger.info(`Product updated: ${product.name} (${product.id})`);

    res.json({
      status: 'success',
      data: formatProduct(updatedProduct || product),
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/products/:id - Delete product (admin only)
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundError('Product');
    }

    // Soft delete
    await prisma.product.update({
      where: { id },
      data: { status: 'archived' },
    });

    logger.info(`Product archived: ${product.name} (${product.id})`);

    res.json({
      status: 'success',
      message: 'Product archived successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;