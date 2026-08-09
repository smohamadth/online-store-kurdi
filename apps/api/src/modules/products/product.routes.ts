import { Router } from 'express';
import { authenticate, authorize, optionalAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validation';
import { prisma } from '../../config/database';
import { cache } from '../../config/redis';
import { logger } from '../../utils/logger';
import { NotFoundError, ConflictError, AppError } from '../../middleware/errorHandler';
import slugify from 'slugify';
import { z } from 'zod';

const router = Router();

// Validation schemas
const createProductSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).optional(),
  description: z.string().min(1),
  shortDescription: z.string().optional(),
  sku: z.string().min(1).max(100),
  type: z.enum(['physical', 'digital']).default('physical'),
  status: z.enum(['draft', 'active', 'inactive', 'archived']).default('draft'),
  price: z.number().positive(),
  compareAtPrice: z.number().positive().optional(),
  costPrice: z.number().positive().optional(),
  trackInventory: z.boolean().default(true),
  quantity: z.number().int().min(0).default(0),
  lowStockThreshold: z.number().int().min(0).default(10),
  downloadUrl: z.string().url().optional(),
  downloadLimit: z.number().int().positive().optional(),
  downloadExpiry: z.number().int().positive().optional(),
  weight: z.number().positive().optional(),
  weightUnit: z.enum(['kg', 'lb', 'oz', 'g']).default('kg'),
  dimensions: z.object({
    length: z.number().positive(),
    width: z.number().positive(),
    height: z.number().positive(),
    unit: z.enum(['cm', 'in', 'm', 'ft']).default('cm'),
  }).optional(),
  categoryId: z.string().optional(),  // Made optional
  metaTitle: z.string().max(255).optional(),
  metaDescription: z.string().max(500).optional(),
  metaKeywords: z.array(z.string()).default([]),
  images: z.array(z.object({
    url: z.string(),
    alt: z.string().optional(),
    isPrimary: z.boolean().default(false),
    sortOrder: z.number().int().default(0),
  })).default([]),
  variants: z.array(z.object({
    name: z.string(),
    sku: z.string(),
    price: z.number().positive(),
    quantity: z.number().int().min(0).default(0),
    attributes: z.record(z.string()),
    isActive: z.boolean().default(true),
  })).default([]),
});

const updateProductSchema = createProductSchema.partial();

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
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

// GET /api/products - Get products with filtering and pagination
router.get('/', async (req, res, next) => {
  try {
    const query = productQuerySchema.parse(req.query);
    const { page, limit, category, type, status, minPrice, maxPrice, search, sort, inStock } = query;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      status: status || 'active',
    };

    if (category) {
      where.category = { slug: category };
    }

    if (type) {
      where.type = type;
    }

    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = minPrice;
      if (maxPrice) where.price.lte = maxPrice;
    }

    if (inStock) {
      where.quantity = { gt: 0 };
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Build order by
    let orderBy: any;
    switch (sort) {
      case 'price_asc': orderBy = { price: 'asc' }; break;
      case 'price_desc': orderBy = { price: 'desc' }; break;
      case 'name_asc': orderBy = { name: 'asc' }; break;
      case 'name_desc': orderBy = { name: 'desc' }; break;
      case 'popular': orderBy = { reviews: { _count: 'desc' } }; break;
      default: orderBy = { createdAt: 'desc' }; break;
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          images: true,
          category: true,
          variants: true,
          reviews: { select: { rating: true } },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.product.count({ where }),
    ]);

    res.json({
      status: 'success',
      data: products.map(formatProduct),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
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

    const products = await prisma.product.findMany({
      where: {
        status: 'active',
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { sku: { contains: q, mode: 'insensitive' } },
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

// POST /api/products - Create product (admin only)
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

    const product = await prisma.product.update({
      where: { id },
      data: {
        ...data,
        slug: data.slug || (data.name ? slugify(data.name, { lower: true, strict: true }) : undefined),
      },
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
      data: formatProduct(product),
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