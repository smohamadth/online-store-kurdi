/**
 * Product-variant routes.
 *
 * This router is mounted at TWO prefixes by app.ts:
 *   /api/variants   - serves /:id (the standalone lookup)
 *   /api/products   - serves /:productId/variants (the nested CRUD)
 *
 * The paths declared here are relative to those mounts. The
 * /:id route works under /api/variants; the /:productId/variants
 * routes only make sense under /api/products. Express handles the
 * cross-mount routing - the router itself doesn't know which
 * mount it's on.
 *
 * The list/create endpoints are public (the storefront reads
 * variants as part of the product page); the write endpoints
 * require admin/manager.
 */
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize, optionalAuth } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import {
  listVariants,
  getVariant,
  createVariant,
  updateVariant,
  deleteVariant,
  parseAttributes,
} from './variant.service';

const router = Router();

// Zod schema for write bodies. `attributes` accepts an object OR a
// JSON string; we don't normalise here because the service layer
// does the round-trip.
const attributesSchema = z
  .union([
    z.record(z.unknown()),
    z.string().refine(
      (s) => {
        try { JSON.parse(s); return true; } catch { return false; }
      },
      { message: 'attributes must be a valid JSON string' }
    ),
  ])
  .optional();

const variantCreateSchema = z.object({
  name: z.string().min(1).max(120),
  sku: z.string().min(1).max(100),
  price: z.number().positive(),
  quantity: z.number().int().min(0).optional(),
  attributes: attributesSchema,
  isActive: z.boolean().optional(),
});

const variantPatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  sku: z.string().min(1).max(100).optional(),
  price: z.number().positive().optional(),
  quantity: z.number().int().min(0).optional(),
  attributes: attributesSchema,
  isActive: z.boolean().optional(),
});

// GET /api/variants/:id - fetch one (e.g. for a direct product link).
// Only reachable when this router is mounted at /api/variants; the
// /:id pattern would otherwise conflict with /api/products/:id.
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const v = await getVariant(req.params.id);
    res.json({
      status: 'success',
      data: { ...v, attributes: parseAttributes(v.attributes) },
    });
  } catch (err) { next(err); }
});

// The remaining routes are only meaningful when the router is
// mounted at /api/products. Mounting at /api/variants would
// expose them at /api/variants/:productId/variants, which is
// nonsensical and we explicitly don't want.

// GET /api/products/:productId/variants
router.get('/:productId/variants', optionalAuth, async (req, res, next) => {
  try {
    const list = await listVariants(req.params.productId);
    res.json({
      status: 'success',
      data: list.map((v) => ({ ...v, attributes: parseAttributes(v.attributes) })),
    });
  } catch (err) { next(err); }
});

// POST /api/products/:productId/variants
router.post('/:productId/variants', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const body = variantCreateSchema.parse(req.body);
    const v = await createVariant(req.params.productId, body);
    res.status(201).json({
      status: 'success',
      data: { ...v, attributes: parseAttributes(v.attributes) },
    });
  } catch (err) { next(err); }
});

// PATCH /api/products/:productId/variants/:id
router.patch('/:productId/variants/:id', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const body = variantPatchSchema.parse(req.body);
    const v = await updateVariant(req.params.id, body);
    res.json({
      status: 'success',
      data: { ...v, attributes: parseAttributes(v.attributes) },
    });
  } catch (err) { next(err); }
});

// DELETE /api/products/:productId/variants/:id
// Soft-delete by default; ?force=true to actually delete the row.
router.delete('/:productId/variants/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const force = req.query.force === 'true';
    const result = await deleteVariant(req.params.id, { force });
    res.json({ status: 'success', data: result });
  } catch (err) { next(err); }
});

export default router;
