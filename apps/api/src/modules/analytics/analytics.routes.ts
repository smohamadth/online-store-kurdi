import { Router } from 'express';
import { AnalyticsController } from './analytics.controller';
import { authenticate, authorize } from '../../middleware/auth';

const router = Router();
const analyticsController = new AnalyticsController();

// Public routes (no authentication required)

// POST /api/analytics/track - Track single event
router.post('/track', analyticsController.trackEvent);

// POST /api/analytics/track/batch - Track multiple events
router.post('/track/batch', analyticsController.trackEvents);

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