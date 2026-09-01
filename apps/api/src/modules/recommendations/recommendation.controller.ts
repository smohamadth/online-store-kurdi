// Thin HTTP layer over RecommendationService (mounted by
// recommendation.routes.ts). Parses limit params, shapes responses; the
// auth (the /history endpoint) and opt-in semantics live on the routes.
import { Request, Response, NextFunction } from 'express';
import { RecommendationService } from './recommendation.service';
import { logger } from '../../utils/logger';
import { parsePagination } from '../../utils/pagination';

export class RecommendationController {
  private recommendationService: RecommendationService;

  constructor() {
    this.recommendationService = new RecommendationService();
  }

  // Get "Customers also bought" recommendations
  getAlsoBought = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { productId } = req.params;
      const { limit } = parsePagination(req.query, { limit: 6 });
      const recommendations = await this.recommendationService.getAlsoBought(productId, limit);

      res.json({
        status: 'success',
        data: recommendations,
        type: 'also_bought',
      });
    } catch (error) {
      next(error);
    }
  };

  // Get "Based on your browsing history" recommendations
  getBasedOnHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          status: 'error',
          message: 'Authentication required',
        });
      }

      const { limit } = parsePagination(req.query, { limit: 6 });
      const recommendations = await this.recommendationService.getBasedOnHistory(userId, limit);

      res.json({
        status: 'success',
        data: recommendations,
        type: 'based_on_history',
      });
    } catch (error) {
      next(error);
    }
  };

  // Get "Trending products" recommendations
  getTrending = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { limit } = parsePagination(req.query, { limit: 10 });
      const recommendations = await this.recommendationService.getTrending(limit);

      res.json({
        status: 'success',
        data: recommendations,
        type: 'trending',
      });
    } catch (error) {
      next(error);
    }
  };

  // Get "New arrivals" recommendations
  getNewArrivals = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { limit } = parsePagination(req.query, { limit: 10 });
      const recommendations = await this.recommendationService.getNewArrivals(limit);

      res.json({
        status: 'success',
        data: recommendations,
        type: 'new_arrivals',
      });
    } catch (error) {
      next(error);
    }
  };

  // Get "Frequently bought together" recommendations
  getFrequentlyBoughtTogether = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { productId } = req.params;
      const { limit } = parsePagination(req.query, { limit: 4 });
      const recommendations = await this.recommendationService.getFrequentlyBoughtTogether(productId, limit);

      res.json({
        status: 'success',
        data: recommendations,
        type: 'frequently_bought_together',
      });
    } catch (error) {
      next(error);
    }
  };

  // Get personalized recommendations for homepage
  getPersonalizedRecommendations = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      const { limit } = parsePagination(req.query, { limit: 12 });
      const recommendations = await this.recommendationService.getPersonalizedRecommendations(userId, limit);

      res.json({
        status: 'success',
        data: recommendations,
        type: 'personalized',
      });
    } catch (error) {
      next(error);
    }
  };

  // Log recommendation click
  logClick = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { recommendationType, productId, algorithmVersion } = req.body;
      const sessionId = req.headers['x-session-id'] as string || `session-${Date.now()}`;

      await this.recommendationService.logRecommendationClick(
        req.user?.id || null,
        sessionId,
        recommendationType,
        productId,
        algorithmVersion
      );

      res.json({
        status: 'success',
        message: 'Click logged successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  // Log recommendation purchase
  logPurchase = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          status: 'error',
          message: 'Authentication required',
        });
      }

      const { recommendationType, productId } = req.body;
      const sessionId = req.headers['x-session-id'] as string || `session-${Date.now()}`;

      await this.recommendationService.logRecommendationPurchase(
        userId,
        sessionId,
        recommendationType,
        productId
      );

      res.json({
        status: 'success',
        message: 'Purchase logged successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  // Get recommendation analytics (admin only)
  getAnalytics = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const days = req.query.days ? parseInt(req.query.days as string) : 30;
      const analytics = await this.recommendationService.getRecommendationAnalytics(days);

      res.json({
        status: 'success',
        data: analytics,
      });
    } catch (error) {
      next(error);
    }
  };
}

export default new RecommendationController();