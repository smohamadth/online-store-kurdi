import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { z } from 'zod';

const router = Router();

// Validation schemas
const categorySchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).optional(),
  description: z.string().optional().nullable(),
  image: z.string().optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

// GET /api/categories - Get all categories
router.get('/categories', async (req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        _count: {
          select: { products: true },
        },
        children: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    res.json({
      status: 'success',
      data: categories,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/categories/:id - Get category by ID
router.get('/categories/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: { products: true },
        },
        children: true,
        parent: true,
      },
    });

    if (!category) {
      return res.status(404).json({
        status: 'error',
        message: 'Category not found',
      });
    }

    res.json({
      status: 'success',
      data: category,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/categories - Create category (admin)
router.post('/categories', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const data = categorySchema.parse(req.body);

    // Generate slug if not provided
    const slug = data.slug || data.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    // Check slug uniqueness
    const existing = await prisma.category.findUnique({ where: { slug } });
    if (existing) {
      return res.status(400).json({
        status: 'error',
        message: 'Category with this slug already exists',
      });
    }

    const category = await prisma.category.create({
      data: {
        ...data,
        slug,
      },
      include: {
        _count: { select: { products: true } },
      },
    });

    logger.info(`Category created: ${category.name}`);

    res.status(201).json({
      status: 'success',
      data: category,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/categories/:id - Update category (admin)
router.put('/categories/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = categorySchema.partial().parse(req.body);

    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        status: 'error',
        message: 'Category not found',
      });
    }

    // Check slug uniqueness if changing
    if (data.slug && data.slug !== existing.slug) {
      const slugExists = await prisma.category.findUnique({ where: { slug: data.slug } });
      if (slugExists) {
        return res.status(400).json({
          status: 'error',
          message: 'Category with this slug already exists',
        });
      }
    }

    const category = await prisma.category.update({
      where: { id },
      data,
      include: {
        _count: { select: { products: true } },
      },
    });

    logger.info(`Category updated: ${category.name}`);

    res.json({
      status: 'success',
      data: category,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/categories/:id - Delete category (admin)
router.delete('/categories/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const category = await prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });

    if (!category) {
      return res.status(404).json({
        status: 'error',
        message: 'Category not found',
      });
    }

    if (category._count.products > 0) {
      return res.status(400).json({
        status: 'error',
        message: `Cannot delete category with ${category._count.products} products. Move products first.`,
      });
    }

    await prisma.category.delete({ where: { id } });

    logger.info(`Category deleted: ${category.name}`);

    res.json({
      status: 'success',
      message: 'Category deleted successfully',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
