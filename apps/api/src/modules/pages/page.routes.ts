import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { sanitizeRichText } from '../../utils/sanitizeRichText';
import { serializeContentBlocks, withParsedBlocks } from '../../utils/contentBlocks';

const router = Router();

/**
 * Custom storefront pages.
 *
 *   GET    /api/pages                          public  - published pages only
 *   GET    /api/pages/all                      admin   - drafts included
 *   GET    /api/pages/slug/:slug               public  - one published page
 *   GET    /api/pages/by-type/:type/slug/:slug public  - one published page,
 *                                                       the canonical way
 *                                                       the storefront now
 *                                                       asks for a page
 *                                                       (knowing its type
 *                                                       up-front means a
 *                                                       typo'd type returns
 *                                                       a 404, not the
 *                                                       wrong page)
 *   POST   /api/pages                          admin
 *   PUT    /api/pages/:id                      admin
 *   DELETE /api/pages/:id                      admin
 *
 * Each page carries a `pageType` (info | legal | help) that picks the URL
 * prefix. Slugs are globally unique across all types, so `/info/about` and
 * `/legal/about` cannot both exist at once.
 *
 * `content` is rendered with dangerouslySetInnerHTML on the storefront, so it
 * is sanitised HERE on write. Sanitising on read would leave dangerous markup
 * sitting in the database waiting for the next consumer to forget.
 */

/** The three page types we support, in URL-prefix order. */
export const PAGE_TYPES = ['info', 'legal', 'help'] as const;
export type PageType = (typeof PAGE_TYPES)[number];

/** Reserved: these paths are real routes, a page must not shadow them. */
const RESERVED_SLUGS = new Set([
  'admin', 'account', 'api', 'cart', 'checkout', 'login', 'register',
  'products', 'category', 'search', 'deals', 'contact', 'faq', 'privacy',
  'terms', 'returns', 'track-order', 'forgot-password', 'reset-password',
  'info', 'legal', 'help', 'p', 'blog', 'sitemap.xml', 'robots.txt', '_next',
]);

/** Is `t` one of the three URL prefixes we serve? */
function isPageType(t: string | null | undefined): t is PageType {
  return !!t && (PAGE_TYPES as readonly string[]).includes(t);
}

/**
 * Unicode-aware slug rule.
 *
 * The old rule was /^[a-z0-9]+(?:-[a-z0-9]+)*$/, which rejects every
 * non-Latin script. Combined with a front-end slugifier that stripped the
 * same characters, a Kurdish/Arabic page title produced an empty slug and the
 * resulting page was unreachable at the address the author expected - the
 * "new pages 404" bug. Letters and digits from ANY script are now accepted;
 * separators are still single hyphens and there is still no uppercase,
 * whitespace or punctuation, so slugs stay canonical and collision-safe.
 */
const slugField = z
  .string()
  .min(1)
  .max(120)
  .regex(
    /^[\p{L}\p{N}\p{M}]+(?:-[\p{L}\p{N}\p{M}]+)*$/u,
    'Slug may contain letters, numbers and single hyphens only'
  )
  .refine((s) => s === s.toLowerCase(), 'Slug must be lowercase');

const baseSchema = {
  title: z.string().min(1, 'Title is required').max(200),
  content: z.string().max(200000).optional(),
  excerpt: z.string().max(500).optional().nullable(),
  // Pick a page type at create / update time. We default to
  // "info" for legacy callers that never set this column, so
  // the API doesn't break rows created before the migration.
  pageType: z.enum(PAGE_TYPES).optional(),
  status: z.enum(['draft', 'published']).optional(),
  metaTitle: z.string().max(200).optional().nullable(),
  metaDescription: z.string().max(400).optional().nullable(),
  showInFooter: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  // Layout blocks (page CMS). Unknown types are accepted here and
  // dropped client-side, so a newer admin bundle can save block types
  // an older API doesn't know yet without a 400.
  blocks: z
    .array(
      z.object({
        id: z.string().min(1).max(40),
        type: z.string().min(1).max(40),
        config: z.record(z.any()).optional().nullable(),
      }),
    )
    .max(100)
    .optional()
    .nullable(),
};

const createSchema = z.object({ slug: slugField, ...baseSchema });

const updateSchema = z.object({
  slug: slugField.optional(),
  ...baseSchema,
  title: baseSchema.title.optional(),
});

/** Nullable text fields that an admin must be able to CLEAR. */
const NULLABLE = new Set(['excerpt', 'metaTitle', 'metaDescription', 'blocks']);

function buildData(parsed: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (v === undefined) continue;
    if (v === null && !NULLABLE.has(k)) continue;
    if (k === 'content' && typeof v === 'string') {
      data[k] = sanitizeRichText(v);
    } else if (k === 'blocks') {
      data[k] = serializeContentBlocks(v);
    } else {
      data[k] = v;
    }
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
        pageType: true,
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
    res.json({ status: 'success', data: pages.map(withParsedBlocks) });
  } catch (err) {
    next(err);
  }
});

/**
 * Type-aware page lookup. The storefront now asks for a page by both
 * type and slug (`/api/pages/by-type/info/slug/about`) so an
 * unknown type returns a clean 404, not a wrong page. The
 * `pageType` column is the source of truth; if a row was
 * accidentally given a bad type, this endpoint refuses to
 * serve it.
 */
router.get('/by-type/:type/slug/:slug', async (req, res, next) => {
  try {
    const { type, slug } = req.params;
    if (!isPageType(type)) {
      return res
        .status(404)
        .json({ status: 'error', message: 'Page not found', code: 'NOT_FOUND' });
    }
    const page = await prisma.page.findUnique({ where: { slug } });
    // Three failure modes all return 404 with the same code so
    // a malformed URL doesn't leak whether a draft exists:
    //   - row not found
    //   - row is a draft
    //   - row's type doesn't match the URL (a merchant moved a
    //     page from /info to /legal but left a stale link in
    //     an email campaign)
    if (!page || page.status !== 'published' || page.pageType !== type) {
      return res
        .status(404)
        .json({ status: 'error', message: 'Page not found', code: 'NOT_FOUND' });
    }
    res.json({ status: 'success', data: withParsedBlocks(page) });
  } catch (err) {
    next(err);
  }
});

/**
 * Legacy slug-only lookup. Kept because the old `/p/<slug>`
 * renderer uses it during the transition; the storefront's new
 * type-aware renderers don't call this. Will be removed once
 * the `/p/<slug>` redirect dispatcher is no longer needed.
 */
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

    res.json({ status: 'success', data: withParsedBlocks(page) });
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
    res.json({ status: 'success', data: withParsedBlocks(page) });
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

    // A create that does not say which status it wants is published, NOT a
    // draft. The Prisma column defaults to "draft", so an omitted status used
    // to save a page that 404'd the moment the author visited it - reported
    // three separate times as "my new page is not found". Any client that
    // leaves the field out (a stale admin bundle, a script, a future UI
    // regression) must never be able to recreate that failure. An author who
    // wants privacy passes status: 'draft' explicitly - the same deliberate
    // opt-in the admin UI's checkbox already encodes.
    if (data.status === undefined) data.status = 'published';
    if (data.status === 'published') data.publishedAt = new Date();

    // Same deliberate opt-in for pageType: the schema column
    // already defaults to "info", but a caller that leaves the
    // field out (a script, a stale admin bundle) should land on
    // "info" rather than let the DB default sneak a different
    // value in. The pick is the most common bucket and the
    // safest one to land on by accident.
    if (data.pageType === undefined) data.pageType = 'info';

    const page = await prisma.page.create({ data: data as any });
    logger.info(`Page created: ${page.slug} (${page.pageType}/${page.status})`);
    res.status(201).json({ status: 'success', data: withParsedBlocks(page) });
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
    res.json({ status: 'success', data: withParsedBlocks(page) });
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
