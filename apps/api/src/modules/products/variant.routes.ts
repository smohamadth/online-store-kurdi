/**
 * Standalone variant routes (mounted at /api/variants only).
 *
 *   GET    /                  - list with filters
 *   GET    /:idOrSlug         - by id OR url slug
 *   POST   /                  - top-level create
 *   PATCH  /:id               - update
 *   DELETE /:id               - soft delete by default; ?force=true
 *   PUT    /:id/options       - replace this variant's chosen option values
 *   GET    /:id/options       - read this variant's chosen option values
 *
 * The product-nested routes (mounted at /api/products) live in
 * product-variant.routes.ts. They share the service layer.
 */
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize, optionalAuth } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import {
  listAllVariants, findByIdOrSlug, createVariant,
  updateVariant, deleteVariant,
  setVariantOptionValues, getVariantOptionValues,
  parseAttributes,
} from './variant.service';

const router = Router();

const attributesSchema = z
  .union([
    z.record(z.unknown()),
    z.string().refine((s) => { try { JSON.parse(s); return true; } catch { return false; } },
      { message: 'attributes must be a valid JSON string' }),
  ])
  .optional();

const variantCreateSchema = z.object({
  name: z.string().min(1).max(120),
  sku: z.string().min(1).max(100),
  slug: z.string().min(1).max(140).optional(),
  price: z.number().finite().positive(),
  compareAtPrice: z.number().finite().nonnegative().optional(),
  quantity: z.number().finite().int().min(0).optional(),
  attributes: attributesSchema,
  isActive: z.boolean().optional(),
  sortOrder: z.number().finite().int().optional(),
});

const variantPatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  sku: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(140).nullable().optional(),
  price: z.number().finite().positive().optional(),
  compareAtPrice: z.number().finite().nonnegative().nullable().optional(),
  quantity: z.number().finite().int().min(0).optional(),
  attributes: attributesSchema,
  isActive: z.boolean().optional(),
  sortOrder: z.number().finite().int().optional(),
});

router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const list = await listAllVariants({
      productId: q.productId,
      isActive: q.isActive === 'true' ? true : q.isActive === 'false' ? false : undefined,
      sku: q.sku,
      minPrice: q.minPrice ? Number(q.minPrice) : undefined,
      maxPrice: q.maxPrice ? Number(q.maxPrice) : undefined,
      inStock: q.inStock === 'true' ? true : q.inStock === 'false' ? false : undefined,
      optionValueId: q.optionValueId,
      search: q.search,
      skip: q.skip ? Number(q.skip) : undefined,
      take: q.take ? Number(q.take) : undefined,
    });
    res.json({
      status: 'success',
      data: list.map((v) => ({ ...v, attributes: parseAttributes(v.attributes) })),
    });
  } catch (err) { next(err); }
});

router.get('/:idOrSlug', optionalAuth, async (req, res, next) => {
  try {
    const v = await findByIdOrSlug(req.params.idOrSlug);
    res.json({ status: 'success', data: { ...v, attributes: parseAttributes(v.attributes) } });
  } catch (err) { next(err); }
});

router.post('/', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const productId = req.body?.productId;
    if (!productId) throw new AppError('productId is required for top-level variant create', 400);
    const body = variantCreateSchema.parse(req.body);
    const v = await createVariant(productId, body);
    res.status(201).json({ status: 'success', data: { ...v, attributes: parseAttributes(v.attributes) } });
  } catch (err) { next(err); }
});

router.patch('/:id', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const body = variantPatchSchema.parse(req.body);
    const v = await updateVariant(req.params.id, body);
    res.json({ status: 'success', data: { ...v, attributes: parseAttributes(v.attributes) } });
  } catch (err) { next(err); }
});

router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const force = req.query.force === 'true';
    const result = await deleteVariant(req.params.id, { force });
    res.json({ status: 'success', data: result });
  } catch (err) { next(err); }
});

const variantOptionsBody = z.object({
  optionValueIds: z.array(z.string().uuid()).max(20),
});

router.put('/:id/options', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const body = variantOptionsBody.parse(req.body);
    const out = await setVariantOptionValues(req.params.id, body.optionValueIds);
    res.json({ status: 'success', data: out });
  } catch (err) { next(err); }
});

router.get('/:id/options', optionalAuth, async (req, res, next) => {
  try {
    const out = await getVariantOptionValues(req.params.id);
    res.json({ status: 'success', data: out });
  } catch (err) { next(err); }
});

export { parseAttributes };
export default router;
