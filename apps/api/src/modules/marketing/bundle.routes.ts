/**
 * Product bundles (mounted at /api/bundles).
 *
 * Public reads for the storefront; admin-only writes. Pricing is always
 * computed server-side from current product prices - never stored on the
 * bundle - so a later price change cannot leave a stale bundle price that
 * undercuts the catalogue.
 */
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { AppError, NotFoundError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';
import { priceBundle, bundleAvailable } from './bundle.helpers';

const router = Router();

const bundleSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/i, 'slug must be url-safe').optional(),
  description: z.string().max(2000).optional(),
  discountType: z.enum(['percentage', 'fixed']).optional(),
  discountValue: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
  items: z
    .array(z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(999) }))
    .min(2, 'a bundle needs at least two products'),
});

function slugify(input: string): string {
  return String(input).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
}

/** Shape a bundle row plus its computed pricing for the API. */
function present(bundle: any) {
  const lines = (bundle.items || []).map((i: any) => ({
    price: Number(i.product?.price ?? 0),
    quantity: Number(i.quantity ?? 0),
  }));
  const pricing = priceBundle(lines, bundle.discountType, Number(bundle.discountValue ?? 0));
  return {
    id: bundle.id,
    name: bundle.name,
    slug: bundle.slug,
    description: bundle.description,
    isActive: bundle.isActive,
    discountType: bundle.discountType,
    discountValue: bundle.discountValue,
    items: (bundle.items || []).map((i: any) => ({
      productId: i.productId,
      quantity: i.quantity,
      name: i.product?.name ?? null,
      price: Number(i.product?.price ?? 0),
    })),
    ...pricing,
    available: bundleAvailable(bundle.items || []),
  };
}

// GET /api/bundles - active bundles for the storefront.
// authz-ok: public catalogue read
router.get('/', async (_req, res, next) => {
  try {
    const bundles = await prisma.bundle.findMany({
      where: { isActive: true },
      include: { items: { include: { product: true } } },
    });
    res.json({ status: 'success', data: bundles.map(present) });
  } catch (err) {
    next(err);
  }
});

// GET /api/bundles/:slug - one bundle.
// authz-ok: public catalogue read
router.get('/:slug', async (req, res, next) => {
  try {
    const bundle = await prisma.bundle.findUnique({
      where: { slug: req.params.slug },
      include: { items: { include: { product: true } } },
    });
    if (!bundle || !bundle.isActive) throw new NotFoundError('Bundle');
    res.json({ status: 'success', data: present(bundle) });
  } catch (err) {
    next(err);
  }
});

// POST /api/bundles - create (admin).
router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const data = bundleSchema.parse(req.body);

    // Reject duplicate products up front: two lines for the same product
    // would violate the unique constraint mid-write and leave a half-created
    // bundle behind.
    const ids = data.items.map((i) => i.productId);
    if (new Set(ids).size !== ids.length) {
      throw new AppError('A bundle cannot list the same product twice', 400);
    }

    // Every referenced product must exist, or the bundle prices at 0.
    const found = await prisma.product.findMany({ where: { id: { in: ids } } });
    if (found.length !== ids.length) {
      throw new AppError('One or more products in the bundle do not exist', 400);
    }

    const slug = data.slug ? slugify(data.slug) : slugify(data.name);
    const clash = await prisma.bundle.findUnique({ where: { slug } });
    if (clash) throw new AppError('A bundle with that slug already exists', 409);

    const bundle = await prisma.bundle.create({
      data: {
        name: data.name,
        slug,
        description: data.description ?? null,
        discountType: data.discountType ?? 'percentage',
        discountValue: data.discountValue ?? 0,
        isActive: data.isActive ?? true,
      },
    });

    for (const item of data.items) {
      await prisma.bundleItem.create({
        data: { bundleId: bundle.id, productId: item.productId, quantity: item.quantity },
      });
    }

    const full = await prisma.bundle.findUnique({
      where: { id: bundle.id },
      include: { items: { include: { product: true } } },
    });
    logger.info(`Bundle created: ${bundle.slug}`);
    res.status(201).json({ status: 'success', data: present(full) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/bundles/:id - remove (admin).
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const existing = await prisma.bundle.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Bundle');
    await prisma.bundleItem.deleteMany({ where: { bundleId: existing.id } });
    await prisma.bundle.delete({ where: { id: existing.id } });
    res.json({ status: 'success', message: 'Bundle deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;
