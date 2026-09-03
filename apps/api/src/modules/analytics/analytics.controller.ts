// Thin HTTP layer over AnalyticsService (mounted by analytics.routes.ts):
// validates the event payload shape, maps service results to the standard
// response envelope. Auth/gating is the ROUTE's job - the controller
// trusts that trackingGate (opt-in flag) and authorize() already ran.
import { Request, Response, NextFunction } from 'express';
import { truncateIp } from '../../utils/redact';
import { buildFunnel, biggestDropOff, FUNNEL_STEPS } from './funnel.helpers';
import { z } from 'zod';
import { AnalyticsService } from './analytics.service';
import { logger } from '../../utils/logger';
import { prisma } from '../../config/database';
import { parsePagination, parseDays } from '../../utils/pagination';

/**
 * Event payload schema for the PUBLIC ingestion endpoints (when the
 * store opts in via ANALYTICS_TRACKING_ENABLED). Every field lands
 * verbatim in a UserEvent row, so unbounded client strings were free
 * DB bloat (a megabyte searchQuery per event), and an unbounded batch
 * let one request insert thousands of rows. Metadata is flat in the
 * storefront client (slug, section, ...), so a flat record schema with
 * capped values and a 50-key limit is compatible.
 */
const TRACK_EVENT_SCHEMA = z.object({
  eventType: z.string().min(1).max(50),
  productId: z.string().min(1).max(100).optional(),
  categoryId: z.string().min(1).max(100).optional(),
  searchQuery: z.string().max(300).optional(),
  metadata: z
    .record(z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]))
    .refine((m) => Object.keys(m).length <= 50, { message: 'metadata may have at most 50 keys' })
    .optional(),
});

function sessionIdHeader(req: Request): string {
  const raw = req.headers['x-session-id'];
  const s = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : '';
  return s.slice(0, 200) || `session-${Date.now()}`;
}

export class AnalyticsController {
  private analyticsService: AnalyticsService;

  constructor() {
    this.analyticsService = new AnalyticsService();
  }

  // Track event
  trackEvent = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { eventType, productId, categoryId, searchQuery, metadata } =
        TRACK_EVENT_SCHEMA.parse(req.body);

      const sessionId = sessionIdHeader(req);

      await this.analyticsService.trackEvent({
        userId: req.user?.id,
        sessionId,
        eventType,
        productId,
        categoryId,
        searchQuery,
        metadata,
        userAgent: req.get('User-Agent'),
        // Truncated: a full IP is personal data under GDPR, and these rows
        // are retained indefinitely. The last octet is dropped, which keeps
        // the coarse-location signal analytics actually uses. The newsletter
        // consent record already did this; analytics storing the full address
        // made the store's PII handling inconsistent with its own privacy
        // page.
        ipAddress: truncateIp(req.ip),
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
      // Cap the batch: a thousand-event body used to insert a thousand
      // rows in one request when tracking was enabled.
      const { events } = z
        .object({ events: z.array(TRACK_EVENT_SCHEMA).min(1).max(50) })
        .parse(req.body);
      const sessionId = sessionIdHeader(req);

      const enrichedEvents = events.map((event: any) => ({
        ...event,
        userId: req.user?.id,
        sessionId,
        userAgent: req.get('User-Agent'),
        // Truncated: a full IP is personal data under GDPR, and these rows
        // are retained indefinitely. The last octet is dropped, which keeps
        // the coarse-location signal analytics actually uses. The newsletter
        // consent record already did this; analytics storing the full address
        // made the store's PII handling inconsistent with its own privacy
        // page.
        ipAddress: truncateIp(req.ip),
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

      const days = parseDays(req.query.days, 30);
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
      const days = parseDays(req.query.days, 30);
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
      const days = parseDays(req.query.days, 30);
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
      const { limit } = parsePagination(req.query, { limit: 10 });
      const days = parseDays(req.query.days, 7);
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

  /**
   * GET /api/analytics/funnel - conversion funnel.
   *
   * Counts UNIQUE users (falling back to sessionId for anonymous traffic) per
   * step, not raw events: one shopper reloading a product page twenty times is
   * one person in the funnel, and counting events would make the top step look
   * enormous and every conversion rate look terrible.
   */
  getFunnel = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const days = Math.min(Math.max(parseInt(String(req.query.days ?? '30'), 10) || 30, 1), 365);
      const since = new Date(Date.now() - days * 86400_000);

      const events = await prisma.userEvent.findMany({
        where: { timestamp: { gte: since } },
        select: { eventType: true, userId: true, sessionId: true },
      });

      const uniques: Record<string, Set<string>> = {};
      for (const e of events as any[]) {
        const who = e.userId || e.sessionId;
        if (!who) continue;
        (uniques[e.eventType] ??= new Set()).add(who);
      }

      const counts: Record<string, number> = {};
      for (const step of FUNNEL_STEPS) counts[step] = uniques[step]?.size ?? 0;

      const stages = buildFunnel(counts as any);
      res.json({
        status: 'success',
        data: {
          days,
          stages,
          biggestDropOff: biggestDropOff(stages),
        },
      });
    } catch (error) {
      next(error);
    }
  };
}

export default new AnalyticsController();