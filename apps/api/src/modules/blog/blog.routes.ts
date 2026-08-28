import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { sanitizeRichText } from '../../utils/sanitizeRichText';
import { serializeContentBlocks, parseBlocksColumn } from '../../utils/contentBlocks';

const router = Router();

/**
 * Blog.
 *
 *   GET    /api/blog                 public  - published posts, paginated
 *   GET    /api/blog/tags            public  - tag cloud with counts
 *   GET    /api/blog/all             admin   - drafts included
 *   GET    /api/blog/slug/:slug      public  - one published post
 *   POST   /api/blog/slug/:slug/view public  - fire-and-forget view counter
 *   GET    /api/blog/:id             admin
 *   POST   /api/blog                 admin
 *   PUT    /api/blog/:id             admin
 *   DELETE /api/blog/:id             admin
 *
 * `content` is rendered with dangerouslySetInnerHTML on the storefront, so it
 * is sanitised HERE on write. Sanitising on read would leave dangerous markup
 * in the database for the next consumer to forget about.
 */

/** A post must not shadow a real route under /blog. */
const RESERVED_SLUGS = new Set(['all', 'tags', 'slug', 'new', 'edit', 'feed', 'rss']);

// Unicode-aware - see the identical note in pages/page.routes.ts. A Latin-only
// rule made Kurdish/Arabic titles slugify to nothing, so the post 404'd.
const slugField = z
  .string()
  .min(1)
  .max(120)
  .regex(
    /^[\p{L}\p{N}\p{M}]+(?:-[\p{L}\p{N}\p{M}]+)*$/u,
    'Slug may contain letters, numbers and single hyphens only'
  )
  .refine((s) => s === s.toLowerCase(), 'Slug must be lowercase');

const tagsField = z.array(z.string().min(1).max(40)).max(12).optional().nullable();

const baseSchema = {
  title: z.string().min(1, 'Title is required').max(200),
  content: z.string().max(400000).optional(),
  excerpt: z.string().max(500).optional().nullable(),
  coverImage: z.string().max(1000).optional().nullable(),
  author: z.string().max(120).optional().nullable(),
  tags: tagsField,
  status: z.enum(['draft', 'published']).optional(),
  isFeatured: z.boolean().optional(),
  metaTitle: z.string().max(200).optional().nullable(),
  metaDescription: z.string().max(400).optional().nullable(),
  // Layout blocks (same model as the page CMS). Unknown types are
  // accepted here and dropped client-side, so a newer admin bundle can
  // save block types an older API doesn't know yet without a 400.
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

/** Text fields an admin must be able to CLEAR. */
const NULLABLE = new Set([
  'excerpt', 'coverImage', 'author', 'tags', 'metaTitle', 'metaDescription', 'blocks',
]);

/** Rough reading time, shown on the list and the post. */
function readingMinutes(html: string): number {
  const words = (html || '').replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** Parse the stored JSON tag list; a corrupt value must not break the page. */
function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((t) => typeof t === 'string') : [];
  } catch {
    logger.warn('BlogPost has unparseable tags; treating as none');
    return [];
  }
}

function fromRow(row: any, opts: { withContent?: boolean } = {}) {
  const { content, tags, blocks, ...rest } = row;
  return {
    ...rest,
    tags: parseTags(tags),
    readingMinutes: readingMinutes(content || ''),
    // Hand the client a parsed block array (or null), never the raw JSON
    // column - mirrors the page API.
    blocks: parseBlocksColumn(blocks),
    ...(opts.withContent === false ? {} : { content }),
  };
}

function buildData(parsed: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (v === undefined) continue;
    if (v === null && !NULLABLE.has(k)) continue;

    if (k === 'content' && typeof v === 'string') {
      data[k] = sanitizeRichText(v);
    } else if (k === 'blocks') {
      data[k] = serializeContentBlocks(v);
    } else if (k === 'tags') {
      // Normalise: lowercase, trimmed, de-duplicated, stored as JSON.
      if (v === null) {
        data[k] = null;
      } else {
        const list = Array.from(
          new Set((v as string[]).map((t) => t.trim().toLowerCase()).filter(Boolean))
        );
        data[k] = list.length ? JSON.stringify(list) : null;
      }
    } else {
      data[k] = v;
    }
  }
  return data;
}

// ---------------------------------------------------------------- public list
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 9));
    const tag = (req.query.tag as string || '').trim().toLowerCase();
    const search = (req.query.search as string || '').trim();

    const where: any = { status: 'published' };

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { excerpt: { contains: search } },
      ];
    }

    // Tags live in a JSON string, so filter on the serialised form. Quoting the
    // needle prevents "ship" matching "shipping".
    if (tag) {
      where.tags = { contains: `"${tag}"` };
    }

    const [rows, total] = await Promise.all([
      prisma.blogPost.findMany({
        where,
        // Featured first, then newest. publishedAt can be null on legacy rows,
        // so createdAt is the tiebreaker.
        orderBy: [
          { isFeatured: 'desc' },
          { publishedAt: 'desc' },
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.blogPost.count({ where }),
    ]);

    res.json({
      status: 'success',
      // The list does not need full post bodies - they can be tens of KB each.
      data: rows.map((r) => fromRow(r, { withContent: false })),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (err) {
    next(err);
  }
});

// Declared before /:id so these are never treated as ids.
router.get('/tags', async (_req, res, next) => {
  try {
    const rows = await prisma.blogPost.findMany({
      where: { status: 'published' },
      select: { tags: true },
    });

    const counts = new Map<string, number>();
    for (const r of rows) {
      for (const t of parseTags(r.tags)) {
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }

    const data = [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

    res.json({ status: 'success', data });
  } catch (err) {
    next(err);
  }
});

router.get('/all', authenticate, authorize('admin', 'manager'), async (_req, res, next) => {
  try {
    const rows = await prisma.blogPost.findMany({
      orderBy: [{ createdAt: 'desc' }],
    });
    res.json({ status: 'success', data: rows.map((r) => fromRow(r, { withContent: false })) });
  } catch (err) {
    next(err);
  }
});

router.get('/slug/:slug', async (req, res, next) => {
  try {
    const post = await prisma.blogPost.findUnique({ where: { slug: req.params.slug } });

    // A draft must 404 for the public exactly like a missing post, otherwise
    // its existence and title leak.
    if (!post || post.status !== 'published') {
      return res
        .status(404)
        .json({ status: 'error', message: 'Post not found', code: 'NOT_FOUND' });
    }

    // Two most recent other posts, for "keep reading".
    const related = await prisma.blogPost.findMany({
      where: { status: 'published', id: { not: post.id } },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: 2,
    });

    res.json({
      status: 'success',
      data: {
        ...fromRow(post),
        related: related.map((r) => fromRow(r, { withContent: false })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// Fire-and-forget view counter. Never fails the caller: an analytics blip must
// not stop a reader seeing the article.
router.post('/slug/:slug/view', async (req, res) => {
  try {
    await prisma.blogPost.updateMany({
      where: { slug: req.params.slug, status: 'published' },
      data: { viewCount: { increment: 1 } },
    });
  } catch {
    /* ignore */
  }
  res.json({ status: 'success' });
});

// ------------------------------------------------------------------- admin
router.get('/:id', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const post = await prisma.blogPost.findUnique({ where: { id: req.params.id } });
    if (!post) {
      return res
        .status(404)
        .json({ status: 'error', message: 'Post not found', code: 'NOT_FOUND' });
    }
    res.json({ status: 'success', data: fromRow(post) });
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

    const clash = await prisma.blogPost.findUnique({ where: { slug: parsed.slug } });
    if (clash) {
      return res.status(409).json({
        status: 'error',
        message: `A post with the slug "${parsed.slug}" already exists.`,
        code: 'DUPLICATE_SLUG',
      });
    }

    const data = buildData(parsed);

    // See the matching comment in page.routes.ts: the column default "draft"
    // silently produced posts that 404'd at /blog/<slug> when the caller did
    // not send a status. Publish-by-default on create; drafts are an explicit
    // opt-in.
    if (data.status === undefined) data.status = 'published';
    if (data.status === 'published') data.publishedAt = new Date();

    const post = await prisma.blogPost.create({ data: data as any });
    logger.info(`Blog post created: ${post.slug} (${post.status})`);
    res.status(201).json({ status: 'success', data: fromRow(post) });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const parsed = updateSchema.parse(req.body);

    const existing = await prisma.blogPost.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res
        .status(404)
        .json({ status: 'error', message: 'Post not found', code: 'NOT_FOUND' });
    }

    if (parsed.slug && parsed.slug !== existing.slug) {
      if (RESERVED_SLUGS.has(parsed.slug)) {
        return res.status(400).json({
          status: 'error',
          message: `"${parsed.slug}" is a reserved address. Choose a different slug.`,
          code: 'RESERVED_SLUG',
        });
      }
      const clash = await prisma.blogPost.findUnique({ where: { slug: parsed.slug } });
      if (clash) {
        return res.status(409).json({
          status: 'error',
          message: `A post with the slug "${parsed.slug}" already exists.`,
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

    // Stamp publishedAt the first time a post goes live; clear it if pulled
    // back to draft so the sitemap and ordering stay honest.
    if (data.status === 'published' && existing.status !== 'published') {
      data.publishedAt = new Date();
    } else if (data.status === 'draft') {
      data.publishedAt = null;
    }

    const post = await prisma.blogPost.update({ where: { id: req.params.id }, data: data as any });
    logger.info(`Blog post updated: ${post.slug}`);
    res.json({ status: 'success', data: fromRow(post) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const existing = await prisma.blogPost.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res
        .status(404)
        .json({ status: 'error', message: 'Post not found', code: 'NOT_FOUND' });
    }
    await prisma.blogPost.delete({ where: { id: req.params.id } });
    logger.info(`Blog post deleted: ${existing.slug}`);
    res.json({ status: 'success', message: `Post "${existing.slug}" deleted.` });
  } catch (err) {
    next(err);
  }
});

export default router;
