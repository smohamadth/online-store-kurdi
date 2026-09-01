// ---------------------------------------------------------------------------
// Storefront theme (mounted at /api/theme).
//
// Single-row settings table (id 'default', getOrCreate below). The public
// GET is what the storefront fetches before first paint - colours, layout
// toggles, announcement bar, the active theme key, and optional
// customCss.
//
// customCss is a STORED-XSS surface: it is injected into every storefront
// page, so DANGEROUS_CSS strips script tags / javascript: URLs /
// expression() even though only admins can write it (a compromised admin
// account must not become a store-wide RCE).
//
// activeTheme is validated against the theme REGISTRY (the list of
// installed themes in the web app), not against the schema - an unknown
// theme key is a 400, which is how "theme not found" stops being a
// broken storefront.
// ---------------------------------------------------------------------------
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { listThemeKeys, getThemeConfig } from '../themeStudio/themeStudio.service';

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

  // Active theme key. Whitelisted to keys returned by the theme
  // registry. The schema is `@unique` to a small set of string
  // constants; the runtime check is in the route handler.
  //
  // The schema is intentionally NOT validated here. The handler
  // does the validation against the registry, which is the source
  // of truth for "what themes are installed". A theme the platform
  // doesn't know about is rejected before it ever touches the DB.
  activeTheme: z.string().min(1).max(60).optional().nullable(),
});

const DANGEROUS_CSS = /<\/?script|javascript\s*:|expression\s*\(|@import\s+url\s*\(\s*['"]?\s*javascript/i;

async function getOrCreate() {
  const existing = await prisma.themeSettings.findUnique({ where: { id: 'default' } });
  if (existing) return existing;
  return prisma.themeSettings.create({ data: { id: 'default', activeTheme: 'default' } });
}

// GET /api/theme - public: the storefront needs this to paint itself.
//
// The response now also carries `activeThemeConfig`: the on-disk config of
// the store's active theme (bundled or admin-installed), validated. The
// storefront uses it to render an installed theme's tokens/layouts without a
// rebuild; the static registry in the web bundle remains the fallback when
// the API is unreachable or the theme is only in the bundle.
router.get('/', async (_req, res, next) => {
  try {
    const theme = await getOrCreate();
    let activeThemeConfig: unknown = null;
    try {
      activeThemeConfig = await getThemeConfig(theme.activeTheme);
    } catch {
      activeThemeConfig = null;
    }
    res.json({ status: 'success', data: { ...theme, activeThemeConfig } });
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
    const NULLABLE = new Set(['announcementText', 'announcementLink', 'customCss', 'activeTheme']);

    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      if (v === null && !NULLABLE.has(k)) continue;
      // Validate activeTheme against the on-disk theme catalog (the runtime
      // source of truth: bundled themes + admin-installed themes). This used
      // to be a hardcoded list that had to be kept in sync with the web
      // registry by hand — a drift made an installed theme un-activatable
      // with a confusing 400. The disk catalog can never drift: it IS the
      // set of themes that actually exist.
      if (k === 'activeTheme' && v !== null) {
        const installed = await listThemeKeys();
        if (!installed.includes(v as string)) {
          return res.status(400).json({
            status: 'error',
            message: `Unknown theme "${v}". Available themes: ${installed.join(', ') || '(none)'}.`,
            code: 'UNKNOWN_THEME',
          });
        }
      }
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
    const theme = await prisma.themeSettings.create({
      data: { id: 'default', activeTheme: 'default' },
    });
    logger.info('Theme settings reset to defaults');
    res.json({ status: 'success', data: theme });
  } catch (err) {
    next(err);
  }
});

export default router;
