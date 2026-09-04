// ---------------------------------------------------------------------------
// Analytics API (mounted at /api/analytics).
//
// Two audiences: the storefront's event pipeline (POST /track, /track/batch
// - gated behind ANALYTICS_TRACKING_ENABLED, see trackingGate) and the
// admin analytics pages (trending, product/search analytics, real-time
// stats - admin/manager only). The controller holds no Prisma access;
// the service does.
// ---------------------------------------------------------------------------
import { Router } from 'express';
import { AnalyticsController } from './analytics.controller';
import { authenticate, authorize, optionalAuth } from '../../middleware/auth';

const router = Router();
const analyticsController = new AnalyticsController();

// Public routes (no authentication required)

// Event tracking is opt-in per store (ANALYTICS_TRACKING_ENABLED=true).
// The endpoint stores IP address, user agent and session per event, so it
// must not exist unless the store owner deliberately turns it on - the
// /privacy page documents the flag's off-by-default behaviour, and a 404
// (not a 403) keeps the surface unadvertised when it is closed.
const trackingGate = (req: any, res: any, next: any) => {
  if (process.env.ANALYTICS_TRACKING_ENABLED !== 'true') {
    return res.status(404).json({ status: 'error', message: 'Not found' });
  }
  next();
};

// POST /api/analytics/track - Track single event (only when enabled).
// optionalAuth so a signed-in storefront can attach userId (the client
// already sends Authorization; without this middleware req.user is always
// undefined and logged-in events never link to an account).
router.post('/track', trackingGate, optionalAuth, analyticsController.trackEvent);

// POST /api/analytics/track/batch - Track multiple events (only when enabled)
router.post('/track/batch', trackingGate, optionalAuth, analyticsController.trackEvents);

// GET /api/analytics/trending - Get trending products
router.get('/trending', analyticsController.getTrendingProducts);

// Protected routes (authentication required)

// GET /api/analytics/user/behavior - Get user behavior
router.get(
  '/user/behavior',
  authenticate,
  analyticsController.getUserBehavior
);

// Admin routes (admin only)

// GET /api/analytics/products/:id - Get product analytics
router.get(
  '/products/:id',
  authenticate,
  authorize('admin', 'manager'),
  analyticsController.getProductAnalytics
);

// GET /api/analytics/search - Get search analytics
router.get(
  '/search',
  authenticate,
  authorize('admin', 'manager'),
  analyticsController.getSearchAnalytics
);

// GET /api/analytics/realtime - Get real-time stats
router.get(
  '/realtime',
  authenticate,
  authorize('admin', 'manager'),
  analyticsController.getRealTimeStats
);

// POST /api/analytics/retention/purge - delete events past the retention
// window. Admin-only and destructive, so it supports dryRun for a look first.
router.post(
  '/retention/purge',
  authenticate,
  authorize('admin'),
  analyticsController.purgeRetention
);

// GET /api/analytics/funnel - conversion funnel (view -> cart -> checkout -> purchase)
router.get(
  '/funnel',
  authenticate,
  authorize('admin', 'manager'),
  analyticsController.getFunnel
);

export default router;