import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';

const router = Router();

const hex = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Must be a hex colour like #1a2b3c')
  .optional()
  .nullable();

const themeSchema = z.object({
  primaryColor: hex,
  primaryTextColor: hex,
  accentColor: hex,
  bodyBg: hex,
  cardBg: hex,
  bodyText: hex,
  mutedText: hex,
  borderColor: hex,
  headerBg: hex,
  headerText: hex,
  footerBg: hex,
  footerText: hex,
  priceColor: hex,
  saleColor: hex,

  fontFamily: z.string().max(60).optional().nullable(),
  baseFontSize: z.number().int().min(12).max(22).optional().nullable(),
  headingWeight: z.number().int().min(400).max(900).optional().nullable(),

  radius: z.number().int().min(0).max(40).optional().nullable(),
  buttonRadius: z.number().int().min(0).max(40).optional().nullable(),
  containerWidth: z.number().int().min(960).max(1920).optional().nullable(),
  cardShadow: z.enum(['none', 'soft', 'strong']).optional().nullable(),

  productsPerRow: z.number().int().min(2).max(6).optional().nullable(),
  showTrustBar: z.boolean().optional().nullable(),
  showTestimonials: z.boolean().optional().nullable(),
  showStats: z.boolean().optional().nullable(),
  showNewsletter: z.boolean().optional().nullable(),
  showDealCountdown: z.boolean().optional().nullable(),
  showCategories: z.boolean().optional().nullable(),
  showFeatured: z.boolean().optional().nullable(),
  showNewArrivals: z.boolean().optional().nullable(),

  announcementText: z.string().max(200).optional().nullable(),
  announcementLink: z.string().max(300).optional().nullable(),
  announcementBg: hex,
  announcementText2: hex,
  showAnnouncement: z.boolean().optional().nullable(),

  // Blocked below: <script>, javascript: and expression() would let a
  // compromised admin account run JS on every storefront page.
  customCss: z.string().max(20000).optional().nullable(),
});

const DANGEROUS_CSS = /<\/?script|javascript\s*:|expression\s*\(|@import\s+url\s*\(\s*['"]?\s*javascript/i;

async function getOrCreate() {
  const existing = await prisma.themeSettings.findUnique({ where: { id: 'default' } });
  if (existing) return existing;
  return prisma.themeSettings.create({ data: { id: 'default' } });
}

// GET /api/theme - public: the storefront needs this to paint itself.
router.get('/', async (_req, res, next) => {
  try {
    const theme = await getOrCreate();
    res.json({ status: 'success', data: theme });
  } catch (err) {
    next(err);
  }
});

// PUT /api/theme - admin only
router.put('/', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const data = themeSchema.parse(req.body);

    if (data.customCss && DANGEROUS_CSS.test(data.customCss)) {
      return res.status(400).json({
        status: 'error',
        message: 'Custom CSS may not contain <script>, javascript: URLs or expression().',
        code: 'UNSAFE_CSS',
      });
    }

    // Only `undefined` (field absent from the request) is skipped, so a
    // partial save never wipes unrelated fields.
    //
    // `null` used to be skipped too, which meant the three nullable fields
    // could never be CLEARED: sending {announcementText: null} returned 200
    // and kept the old text. Deleting an announcement was impossible and
    // looked like "my change didn't save". Nullable fields now accept null;
    // the non-nullable colour/number columns still ignore it, because writing
    // null there would violate the schema and 500.
    const NULLABLE = new Set(['announcementText', 'announcementLink', 'customCss']);

    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      if (v === null && !NULLABLE.has(k)) continue;
      clean[k] = v;
    }

    await getOrCreate();
    const theme = await prisma.themeSettings.update({
      where: { id: 'default' },
      data: clean,
    });

    logger.info('Theme settings updated');
    res.json({ status: 'success', data: theme });
  } catch (err) {
    next(err);
  }
});

// POST /api/theme/reset - back to the shipped defaults
router.post('/reset', authenticate, authorize('admin', 'manager'), async (_req, res, next) => {
  try {
    await prisma.themeSettings.deleteMany({ where: { id: 'default' } });
    const theme = await prisma.themeSettings.create({ data: { id: 'default' } });
    logger.info('Theme settings reset to defaults');
    res.json({ status: 'success', data: theme });
  } catch (err) {
    next(err);
  }
});

export default router;
