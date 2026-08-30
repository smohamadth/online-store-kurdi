/**
 * Product-nested variant routes (mounted at /api/products).
 *
 *   GET    /:productId/variants
 *   POST   /:productId/variants
 *   PATCH  /:productId/variants/:id
 *   DELETE /:productId/variants/:id
 *   GET    /:productId/options       - read the product's option tree
 *   PUT    /:productId/options       - replace the product's option tree
 *
 * Kept in a separate file from variant.routes.ts so the URL
 * shape disambiguates the routes - in particular, the standalone
 * `PUT /:id/options` (for /api/variants/:id/options) and the
 * nested `PUT /:productId/options` (for /api/products/:id/options)
 * would otherwise compete for the same path.
 */
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize, optionalAuth } from '../../middleware/auth';
import {
  listVariants, createVariant, updateVariant, deleteVariant,
  getProductOptions, setProductOptions,
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
  price: z.number().positive(),
  compareAtPrice: z.number().nonnegative().optional(),
  quantity: z.number().int().min(0).optional(),
  attributes: attributesSchema,
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const variantPatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  sku: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(140).nullable().optional(),
  price: z.number().positive().optional(),
  compareAtPrice: z.number().nonnegative().nullable().optional(),
  quantity: z.number().int().min(0).optional(),
  attributes: attributesSchema,
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const optionInputSchema = z.object({
  name: z.string().min(1).max(60),
  sortOrder: z.number().int().optional(),
  values: z.array(z.object({
    value: z.string().min(1).max(60),
    swatch: z.string().regex(/^#[0-9a-fA-F]{3,6}$/).optional().nullable(),
    sortOrder: z.number().int().optional(),
  })).max(20),
});

const optionsBodySchema = z.object({
  options: z.array(optionInputSchema).max(10),
});

router.get('/:productId/variants', optionalAuth, async (req, res, next) => {
  try {
    const list = await listVariants(req.params.productId);
    res.json({
      status: 'success',
      data: list.map((v) => ({ ...v, attributes: parseAttributes(v.attributes) })),
    });
  } catch (err) { next(err); }
});

router.post('/:productId/variants', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const body = variantCreateSchema.parse(req.body);
    const v = await createVariant(req.params.productId, body);
    res.status(201).json({ status: 'success', data: { ...v, attributes: parseAttributes(v.attributes) } });
  } catch (err) { next(err); }
});

router.patch('/:productId/variants/:id', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const body = variantPatchSchema.parse(req.body);
    const v = await updateVariant(req.params.id, body);
    res.json({ status: 'success', data: { ...v, attributes: parseAttributes(v.attributes) } });
  } catch (err) { next(err); }
});

router.delete('/:productId/variants/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const force = req.query.force === 'true';
    const result = await deleteVariant(req.params.id, { force });
    res.json({ status: 'success', data: result });
  } catch (err) { next(err); }
});

router.get('/:productId/options', optionalAuth, async (req, res, next) => {
  try {
    const out = await getProductOptions(req.params.productId);
    res.json({ status: 'success', data: out });
  } catch (err) { next(err); }
});

router.put('/:productId/options', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const body = optionsBodySchema.parse(req.body);
    const out = await setProductOptions(req.params.productId, body.options);
    res.json({ status: 'success', data: out });
  } catch (err) { next(err); }
});

export default router;
