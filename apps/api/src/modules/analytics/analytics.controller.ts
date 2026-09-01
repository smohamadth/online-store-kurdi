// Thin HTTP layer over AnalyticsService (mounted by analytics.routes.ts):
// validates the event payload shape, maps service results to the standard
// response envelope. Auth/gating is the ROUTE's job - the controller
// trusts that trackingGate (opt-in flag) and authorize() already ran.
import { Request, Response, NextFunction } from 'express';
import { AnalyticsService } from './analytics.service';
import { logger } from '../../utils/logger';

export class AnalyticsController {
  private analyticsService: AnalyticsService;

  constructor() {
    this.analyticsService = new AnalyticsService();
  }

  // Track event
  trackEvent = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        eventType,
        productId,
        categoryId,
        searchQuery,
        metadata,
      } = req.body;

      const sessionId = req.headers['x-session-id'] as string || `session-${Date.now()}`;

      await this.analyticsService.trackEvent({
        userId: req.user?.id,
        sessionId,
        eventType,
        productId,
        categoryId,
        searchQuery,
        metadata,
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip,
      });

      res.json({
        status: 'success',
        message: 'Event tracked successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  // Track multiple events
  trackEvents = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { events } = req.body;
      const sessionId = req.headers['x-session-id'] as string || `session-${Date.now()}`;

      const enrichedEvents = events.map((event: any) => ({
        ...event,
        userId: req.user?.id,
        sessionId,
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip,
      }));

      await this.analyticsService.trackEvents(enrichedEvents);

      res.json({
        status: 'success',
        message: `${events.length} events tracked successfully`,
      });
    } catch (error) {
      next(error);
    }
  };

  // Get user behavior
  getUserBehavior = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          status: 'error',
          message: 'Authentication required',
        });
      }

      const days = req.query.days ? parseInt(req.query.days as string) : 30;
      const behavior = await this.analyticsService.getUserBehavior(userId, days);

      res.json({
        status: 'success',
        data: behavior,
      });
    } catch (error) {
      next(error);
    }
  };

  // Get product analytics (admin only)
  getProductAnalytics = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const days = req.query.days ? parseInt(req.query.days as string) : 30;
      const analytics = await this.analyticsService.getProductAnalytics(id, days);

      res.json({
        status: 'success',
        data: analytics,
      });
    } catch (error) {
      next(error);
    }
  };

  // Get search analytics (admin only)
  getSearchAnalytics = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const days = req.query.days ? parseInt(req.query.days as string) : 30;
      const analytics = await this.analyticsService.getSearchAnalytics(days);

      res.json({
        status: 'success',
        data: analytics,
      });
    } catch (error) {
      next(error);
    }
  };

  // Get trending products
  getTrendingProducts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const days = req.query.days ? parseInt(req.query.days as string) : 7;
      const products = await this.analyticsService.getTrendingProducts(limit, days);

      res.json({
        status: 'success',
        data: products,
      });
    } catch (error) {
      next(error);
    }
  };

  // Get real-time stats (admin only)
  getRealTimeStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await this.analyticsService.getRealTimeStats();

      res.json({
        status: 'success',
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  };
}

export default new AnalyticsController();