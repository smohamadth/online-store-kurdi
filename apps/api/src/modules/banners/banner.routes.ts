import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';

const router = Router();

// Normalizes '' -> null.
// Note: the `.or(z.literal('').transform(...))` idiom used elsewhere only works
// when the left branch REJECTS '' (e.g. z.string().uuid()). For a plain
// z.string() the left branch already accepts '', so the .or() never fires and
// empty fields persist as ''. Hence the explicit transform below.
const nullableStr = z
  .string()
  .max(1000)
  .optional()
  .nullable()
  .transform((v) => (v === undefined ? undefined : v === null || v.trim() === '' ? null : v));

const nullableDate = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v === undefined ? undefined : v === null || v.trim() === '' ? null : v))
  .refine((v) => v == null || !Number.isNaN(Date.parse(v)), { message: 'Invalid date' });

const bannerSchema = z.object({
  title: z.string().min(1).max(200),
  subtitle: nullableStr,
  description: nullableStr,
  image: z.string().max(1000).optional().default('').transform((v) => v ?? ''),
  mobileImage: nullableStr,
  linkUrl: nullableStr,
  buttonText: nullableStr,
  secondaryText: nullableStr,
  secondaryUrl: nullableStr,
  badge: nullableStr,
  textColor: z.string().max(30).optional(),
  overlayColor: z.string().max(300).optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
  position: z.enum(['hero', 'promo', 'strip']).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  startsAt: nullableDate,
  endsAt: nullableDate,
});

// GET /api/banners - public, active banners (optionally by position)
router.get('/', async (req, res, next) => {
  try {
    const { position } = req.query as { position?: string };
    const now = new Date();

    const banners = await prisma.banner.findMany({
      where: {
        isActive: true,
        ...(position ? { position } : {}),
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });

    res.json({ status: 'success', data: banners });
  } catch (error) {
    next(error);
  }
});

// GET /api/banners/all - admin, everything
router.get('/all', authenticate, authorize('admin', 'manager'), async (_req, res, next) => {
  try {
    const banners = await prisma.banner.findMany({
      orderBy: [{ position: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    res.json({ status: 'success', data: banners });
  } catch (error) {
    next(error);
  }
});

// POST /api/banners
router.post('/', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const data = bannerSchema.parse(req.body);
    const banner = await prisma.banner.create({
      data: {
        ...data,
        startsAt: data.startsAt ? new Date(data.startsAt) : null,
        endsAt: data.endsAt ? new Date(data.endsAt) : null,
      } as any,
    });
    logger.info(`Banner created: ${banner.id}`);
    res.status(201).json({ status: 'success', data: banner });
  } catch (error) {
    next(error);
  }
});

// PUT /api/banners/:id
router.put('/:id', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const data = bannerSchema.partial().parse(req.body);
    const banner = await prisma.banner.update({
      where: { id: req.params.id },
      data: {
        ...data,
        ...(data.startsAt !== undefined ? { startsAt: data.startsAt ? new Date(data.startsAt) : null } : {}),
        ...(data.endsAt !== undefined ? { endsAt: data.endsAt ? new Date(data.endsAt) : null } : {}),
      } as any,
    });
    res.json({ status: 'success', data: banner });
  } catch (error) {
    next(error);
  }
});

// PUT /api/banners/reorder - bulk sort order
router.put('/bulk/reorder', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const schema = z.object({ items: z.array(z.object({ id: z.string(), sortOrder: z.number().int() })) });
    const { items } = schema.parse(req.body);
    await prisma.$transaction(
      items.map((i) => prisma.banner.update({ where: { id: i.id }, data: { sortOrder: i.sortOrder } }))
    );
    res.json({ status: 'success', message: 'Order updated' });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/banners/:id
router.delete('/:id', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    await prisma.banner.delete({ where: { id: req.params.id } });
    res.json({ status: 'success', message: 'Banner deleted' });
  } catch (error) {
    next(error);
  }
});

export default router;
