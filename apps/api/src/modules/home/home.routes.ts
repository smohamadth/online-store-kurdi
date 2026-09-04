import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { ALL_TYPES } from './home.defaults';
import { seedMissingHomeSections } from './home.seed';
import { scrubBuilderConfig } from '../../utils/scrubBuilderConfig';

const router = Router();

/**
 * Home page builder.
 *
 *   GET    /api/home-sections          public  - what the storefront renders
 *   PUT    /api/home-sections/:id      admin   - edit one block
 *   PUT    /api/home-sections/reorder  admin   - persist a new order
 *   POST   /api/home-sections          admin   - add a block
 *   DELETE /api/home-sections/:id      admin   - remove a block
 *   POST   /api/home-sections/reset    admin   - back to the shipped layout
 *
 * `config` is stored as a JSON *string* (SQLite has no JSON type). Passing an
 * object straight to a String column is a 500 this codebase has hit before, so
 * serialisation happens in exactly one place: toRow()/fromRow() below.
 */

export { seedMissingHomeSections as ensureSeeded } from './home.seed';

/** Parse the stored JSON string; a corrupt value must not break the page. */
export function fromRow(row: any) {
  let config: unknown = {};
  if (row.config) {
    try {
      config = JSON.parse(row.config);
    } catch {
      logger.warn(`HomeSection ${row.key} has unparseable config; using {}`);
      config = {};
    }
  }
  return { ...row, config };
}

const configSchema = z.record(z.any()).optional().nullable();

/** HTML + URL fields in any home-section config (P1.10). */
function scrubConfig(_type: string, config: Record<string, any>): Record<string, any> {
  return scrubBuilderConfig(config);
}

const updateSchema = z.object({
  title: z.string().max(200).optional().nullable(),
  subtitle: z.string().max(500).optional().nullable(),
  isVisible: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  config: configSchema,
});

const createSchema = z.object({
  key: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Key may only contain letters, numbers, - and _'),
  type: z.enum(ALL_TYPES as [string, ...string[]]),
  title: z.string().max(200).optional().nullable(),
  subtitle: z.string().max(500).optional().nullable(),
  isVisible: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  config: configSchema,
});

const reorderSchema = z.object({
  order: z.array(z.string().min(1)).min(1).max(100),
});

// ---------------------------------------------------------------- public read
router.get('/', async (_req, res, next) => {
  try {
    const rows = await prisma.homeSection.findMany({ orderBy: { sortOrder: 'asc' } });
    res.json({ status: 'success', data: rows.map(fromRow) });
  } catch (err) {
    next(err);
  }
});

// -------------------------------------------------------------------- reorder
// Declared before /:id so "reorder" is never treated as an id.
router.put('/reorder', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const { order } = reorderSchema.parse(req.body);

    const rows = await prisma.homeSection.findMany({
      select: { id: true },
      orderBy: { sortOrder: 'asc' },
    });
    const known = new Set(rows.map((r) => r.id));
    const unknown = order.filter((id) => !known.has(id));
    if (unknown.length) {
      // Fail loudly: silently ignoring ids would report success while the
      // admin's new order was only partly applied.
      return res.status(400).json({
        status: 'error',
        message: `Unknown section id(s): ${unknown.join(', ')}`,
        code: 'UNKNOWN_SECTION',
      });
    }

    // Listed ids first (deduped), then any omitted rows in their previous
    // order — a partial payload must not interleave leftover sortOrders.
    const listed = [...new Set(order)];
    const omitted = rows.map((r) => r.id).filter((id) => !listed.includes(id));
    const nextOrder = [...listed, ...omitted];

    await prisma.$transaction(
      nextOrder.map((id, i) =>
        prisma.homeSection.update({ where: { id }, data: { sortOrder: (i + 1) * 10 } })
      )
    );

    const updated = await prisma.homeSection.findMany({ orderBy: { sortOrder: 'asc' } });
    logger.info('Home sections reordered');
    res.json({ status: 'success', data: updated.map(fromRow) });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------- edit
router.put('/:id', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const data = updateSchema.parse(req.body);

    const existing = await prisma.homeSection.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res
        .status(404)
        .json({ status: 'error', message: 'Home section not found', code: 'NOT_FOUND' });
    }

    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.subtitle !== undefined) patch.subtitle = data.subtitle;
    if (data.isVisible !== undefined) patch.isVisible = data.isVisible;
    if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder;
    if (data.config !== undefined) {
      patch.config =
        data.config === null ? null : JSON.stringify(scrubConfig(existing.type, data.config));
    }

    const row = await prisma.homeSection.update({ where: { id: req.params.id }, data: patch });
    logger.info(`Home section updated: ${row.key}`);
    res.json({ status: 'success', data: fromRow(row) });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------ add block
router.post('/', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);

    const clash = await prisma.homeSection.findUnique({ where: { key: data.key } });
    if (clash) {
      return res.status(409).json({
        status: 'error',
        message: `A section with the key "${data.key}" already exists.`,
        code: 'DUPLICATE_KEY',
      });
    }

    const last = await prisma.homeSection.findFirst({ orderBy: { sortOrder: 'desc' } });

    const row = await prisma.homeSection.create({
      data: {
        key: data.key,
        type: data.type,
        title: data.title ?? null,
        subtitle: data.subtitle ?? null,
        isVisible: data.isVisible ?? true,
        sortOrder: data.sortOrder ?? (last ? last.sortOrder + 10 : 10),
        config: data.config ? JSON.stringify(scrubConfig(data.type, data.config)) : null,
      },
    });

    logger.info(`Home section created: ${row.key}`);
    res.status(201).json({ status: 'success', data: fromRow(row) });
  } catch (err) {
    next(err);
  }
});

// --------------------------------------------------------------------- delete
router.delete('/:id', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const existing = await prisma.homeSection.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res
        .status(404)
        .json({ status: 'error', message: 'Home section not found', code: 'NOT_FOUND' });
    }
    await prisma.homeSection.delete({ where: { id: req.params.id } });
    logger.info(`Home section deleted: ${existing.key}`);
    res.json({ status: 'success', message: `Section "${existing.key}" deleted.` });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------- reset
router.post('/reset', authenticate, authorize('admin', 'manager'), async (_req, res, next) => {
  try {
    await prisma.homeSection.deleteMany({});
    await seedMissingHomeSections();
    const rows = await prisma.homeSection.findMany({ orderBy: { sortOrder: 'asc' } });
    logger.info('Home sections reset to defaults');
    res.json({ status: 'success', data: rows.map(fromRow) });
  } catch (err) {
    next(err);
  }
});

export default router;
