// ---------------------------------------------------------------------------
// Developer API (mounted at /api/developers).
//
//   GET /api/developers           - the public-endpoint manifest (JSON)
//   GET /api/developers/manifest  - alias
//   GET /api/developers/bootstrap - settings + home sections + banners +
//                                   categories + header/footer menus in one
//                                   call, for headless storefronts.
//
// Everything here is read-only and serves only data the public endpoints
// already expose — the value is discoverability and fewer round trips,
// never extra privileges.
// ---------------------------------------------------------------------------
import { Router } from 'express';
import { prisma } from '../../config/database';
import { isStripeConfigured } from '../../config/stripe';
import { ensureSeeded, fromRow } from '../home/home.routes';
import { getEnabledGateways } from '../payments/gatewayConfig';
import { PUBLIC_ENDPOINTS, MANIFEST_VERSION } from './publicEndpoints';

const router = Router();

// GET /api/developers — the manifest
router.get(['/', '/manifest'], (_req, res, next) => {
  try {
    res.json({
      status: 'success',
      data: {
        version: MANIFEST_VERSION,
        basePath: '/api',
        envelope: 'Every response is { status, data } (errors add message + code).',
        endpoints: PUBLIC_ENDPOINTS,
      },
    });
  } catch (err) {
    next(err);
  }
});

/** Active menu at a location, mirroring GET /api/menus/location/:location. */
async function fetchMenu(location: string) {
  return prisma.menu.findFirst({
    where: { location: location as any, isActive: true },
    include: {
      items: {
        where: { parentId: null, isActive: true },
        orderBy: { sortOrder: 'asc' },
        include: {
          children: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
      },
    },
  });
}

// GET /api/developers/bootstrap — one-call storefront bundle.
//
// Each bundle member mirrors its public endpoint so the bundle never
// shows something the storefront itself would not render:
//   settings    -> GET /api/settings        (incl. capability flags)
//   sections    -> GET /api/home-sections   (rows in order, config parsed)
//   banners     -> GET /api/banners         (active, inside schedule)
//   categories  -> GET /api/categories      (with counts + children)
//   menus       -> GET /api/menus/location/{header,footer}
// authz-ok: public storefront bundle; mirrors the public endpoints and scrubs gateway secrets
router.get('/bootstrap', async (_req, res, next) => {
  try {
    // Settings mirror GET /api/settings: the default row is created on
    // first read when missing, and the secret-free capability flags are
    // appended exactly as that route appends them.
    // Home sections are read-only here (P1.11): seeding is admin reset / db seed.
    let settingsRow = await prisma.storeSettings.findUnique({ where: { id: 'default' } });
    if (!settingsRow) {
      settingsRow = await prisma.storeSettings.create({ data: { id: 'default' } });
    }
    const settings = {
      ...settingsRow,
      stripeEnabled: isStripeConfigured(),
      paymentGateways: await getEnabledGateways(),
    };
    const [sectionRows, bannerRows, categoryRows, headerMenu, footerMenu] =
      await Promise.all([
        prisma.homeSection.findMany({ orderBy: { sortOrder: 'asc' } }),
        prisma.banner.findMany({
          where: {
            isActive: true,
            AND: [
              { OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }] },
              { OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] },
            ],
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        }),
        prisma.category.findMany({
          include: { _count: { select: { products: true } }, children: true },
          orderBy: { sortOrder: 'asc' },
        }),
        fetchMenu('header'),
        fetchMenu('footer'),
      ]);

    res.json({
      status: 'success',
      data: {
        settings,
        sections: sectionRows.map(fromRow),
        banners: bannerRows,
        categories: categoryRows,
        menus: { header: headerMenu, footer: footerMenu },
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
