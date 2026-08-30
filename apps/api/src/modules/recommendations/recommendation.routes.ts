// ---------------------------------------------------------------------------
// Recommendations API (mounted at /api/recommendations) - the feeds the
// storefront renders on the PDP and home page: trending, new arrivals,
// also-bought, bought-together, and (auth) history-based. All public
// except /history. See recommendation.service.ts for the signal sources
// and the same-category fallback.
// ---------------------------------------------------------------------------
import { Router } from 'express';
import { RecommendationController } from './recommendation.controller';
import { authenticate, authorize, optionalAuth } from '../../middleware/auth';

const router = Router();
const recommendationController = new RecommendationController();

// Public routes (no authentication required)

// GET /api/recommendations/trending - Get trending products
router.get('/trending', recommendationController.getTrending);

// GET /api/recommendations/new-arrivals - Get new arrivals
router.get('/new-arrivals', recommendationController.getNewArrivals);

// GET /api/recommendations/also-bought/:productId - Get "Customers also bought"
router.get('/also-bought/:productId', recommendationController.getAlsoBought);

// GET /api/recommendations/bought-together/:productId - Get "Frequently bought together"
router.get('/bought-together/:productId', recommendationController.getFrequentlyBoughtTogether);

// Protected routes (authentication required)

// GET /api/recommendations/history - Get recommendations based on browsing history
router.get(
  '/history',
  authenticate,
  recommendationController.getBasedOnHistory
);

// GET /api/recommendations/personalized - Get personalized recommendations
router.get(
  '/personalized',
  optionalAuth,
  recommendationController.getPersonalizedRecommendations
);

// POST /api/recommendations/click - Log recommendation click
router.post('/click', recommendationController.logClick);

// POST /api/recommendations/purchase - Log recommendation purchase
router.post(
  '/purchase',
  authenticate,
  recommendationController.logPurchase
);

// Admin routes (admin only)

// GET /api/recommendations/analytics - Get recommendation analytics
router.get(
  '/analytics',
  authenticate,
  authorize('admin', 'manager'),
  recommendationController.getAnalytics
);

export default router;