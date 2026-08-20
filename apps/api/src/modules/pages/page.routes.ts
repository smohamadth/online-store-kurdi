import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { sanitizeRichText } from '../../utils/sanitizeRichText';

const router = Router();

/**
 * Custom storefront pages.
 *
 *   GET    /api/pages            public  - published pages only
 *   GET    /api/pages/all        admin   - drafts included
 *   GET    /api/pages/slug/:slug public  - one published page
 *   POST   /api/pages            admin
 *   PUT    /api/pages/:id        admin
 *   DELETE /api/pages/:id        admin
 *
 * `content` is rendered with dangerouslySetInnerHTML on the storefront, so it
 * is sanitised HERE on write. Sanitising on read would leave dangerous markup
 * sitting in the database waiting for the next consumer to forget.
 */

/** Reserved: these paths are real routes, a page must not shadow them. */
const RESERVED_SLUGS = new Set([
  'admin', 'account', 'api', 'cart', 'checkout', 'login', 'register',
  'products', 'category', 'search', 'deals', 'contact', 'faq', 'privacy',
  'terms', 'returns', 'track-order', 'forgot-password', 'reset-password',
  'p', 'blog', 'sitemap.xml', 'robots.txt', '_next',
]);

const slugField = z
  .string()
  .min(1)
  .max(120)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Slug may contain lowercase letters, numbers and single hyphens only'
  );

const baseSchema = {
  title: z.string().min(1, 'Title is required').max(200),
  content: z.string().max(200000).optional(),
  excerpt: z.string().max(500).optional().nullable(),
  status: z.enum(['draft', 'published']).optional(),
  metaTitle: z.string().max(200).optional().nullable(),
  metaDescription: z.string().max(400).optional().nullable(),
  showInFooter: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
};

const createSchema = z.object({ slug: slugField, ...baseSchema });

const updateSchema = z.object({
  slug: slugField.optional(),
  ...baseSchema,
  title: baseSchema.title.optional(),
});

/** Nullable text fields that an admin must be able to CLEAR. */
const NULLABLE = new Set(['excerpt', 'metaTitle', 'metaDescription']);

function buildData(parsed: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (v === undefined) continue;
    if (v === null && !NULLABLE.has(k)) continue;
    data[k] = k === 'content' && typeof v === 'string' ? sanitizeRichText(v) : v;
  }
  return data;
}

// ------------------------------------------------------------------ public
router.get('/', async (_req, res, next) => {
  try {
    const pages = await prisma.page.findMany({
      where: { status: 'published' },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      select: {
        id: true, slug: true, title: true, excerpt: true,
        showInFooter: true, sortOrder: true, updatedAt: true,
      },
    });
    res.json({ status: 'success', data: pages });
  } catch (err) {
    next(err);
  }
});

// Declared before /:id so "all" is never treated as an id.
router.get('/all', authenticate, authorize('admin', 'manager'), async (_req, res, next) => {
  try {
    const pages = await prisma.page.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    res.json({ status: 'success', data: pages });
  } catch (err) {
    next(err);
  }
});

router.get('/slug/:slug', async (req, res, next) => {
  try {
    const page = await prisma.page.findUnique({ where: { slug: req.params.slug } });

    // A draft must 404 for the public exactly like a missing page, otherwise
    // its existence (and title) leaks through the error message.
    if (!page || page.status !== 'published') {
      return res
        .status(404)
        .json({ status: 'error', message: 'Page not found', code: 'NOT_FOUND' });
    }

    res.json({ status: 'success', data: page });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------- admin
router.get('/:id', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const page = await prisma.page.findUnique({ where: { id: req.params.id } });
    if (!page) {
      return res
        .status(404)
        .json({ status: 'error', message: 'Page not found', code: 'NOT_FOUND' });
    }
    res.json({ status: 'success', data: page });
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const parsed = createSchema.parse(req.body);

    if (RESERVED_SLUGS.has(parsed.slug)) {
      return res.status(400).json({
        status: 'error',
        message: `"${parsed.slug}" is a reserved address. Choose a different slug.`,
        code: 'RESERVED_SLUG',
      });
    }

    const clash = await prisma.page.findUnique({ where: { slug: parsed.slug } });
    if (clash) {
      return res.status(409).json({
        status: 'error',
        message: `A page with the slug "${parsed.slug}" already exists.`,
        code: 'DUPLICATE_SLUG',
      });
    }

    const data = buildData(parsed);
    if (data.status === 'published') data.publishedAt = new Date();

    const page = await prisma.page.create({ data: data as any });
    logger.info(`Page created: ${page.slug}`);
    res.status(201).json({ status: 'success', data: page });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const parsed = updateSchema.parse(req.body);

    const existing = await prisma.page.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res
        .status(404)
        .json({ status: 'error', message: 'Page not found', code: 'NOT_FOUND' });
    }

    if (parsed.slug && parsed.slug !== existing.slug) {
      if (RESERVED_SLUGS.has(parsed.slug)) {
        return res.status(400).json({
          status: 'error',
          message: `"${parsed.slug}" is a reserved address. Choose a different slug.`,
          code: 'RESERVED_SLUG',
        });
      }
      const clash = await prisma.page.findUnique({ where: { slug: parsed.slug } });
      if (clash) {
        return res.status(409).json({
          status: 'error',
          message: `A page with the slug "${parsed.slug}" already exists.`,
          code: 'DUPLICATE_SLUG',
        });
      }
    }

    const data = buildData(parsed);
    if (Object.keys(data).length === 0) {
      return res
        .status(400)
        .json({ status: 'error', message: 'No changes supplied.', code: 'NO_CHANGES' });
    }

    // Stamp publishedAt the first time a page goes live, and clear it if the
    // page is pulled back to draft.
    if (data.status === 'published' && existing.status !== 'published') {
      data.publishedAt = new Date();
    } else if (data.status === 'draft') {
      data.publishedAt = null;
    }

    const page = await prisma.page.update({ where: { id: req.params.id }, data: data as any });
    logger.info(`Page updated: ${page.slug}`);
    res.json({ status: 'success', data: page });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const existing = await prisma.page.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res
        .status(404)
        .json({ status: 'error', message: 'Page not found', code: 'NOT_FOUND' });
    }
    await prisma.page.delete({ where: { id: req.params.id } });
    logger.info(`Page deleted: ${existing.slug}`);
    res.json({ status: 'success', message: `Page "${existing.slug}" deleted.` });
  } catch (err) {
    next(err);
  }
});

export default router;
