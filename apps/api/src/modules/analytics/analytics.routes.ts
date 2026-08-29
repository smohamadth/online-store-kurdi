import { Router } from 'express';
import { AnalyticsController } from './analytics.controller';
import { authenticate, authorize } from '../../middleware/auth';

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

// POST /api/analytics/track - Track single event (only when enabled)
router.post('/track', trackingGate, analyticsController.trackEvent);

// POST /api/analytics/track/batch - Track multiple events (only when enabled)
router.post('/track/batch', trackingGate, analyticsController.trackEvents);

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

export default router;