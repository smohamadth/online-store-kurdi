import { PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';
import { cache } from '../../config/redis';
import { logger } from '../../utils/logger';

// User event interface
export interface UserEvent {
  userId?: string;
  sessionId: string;
  eventType: string;
  productId?: string;
  categoryId?: string;
  searchQuery?: string;
  metadata?: Record<string, any>;
  timestamp?: Date;
  userAgent?: string;
  ipAddress?: string;
}

// Analytics service for tracking user behavior
export class AnalyticsService {
  private prisma: PrismaClient;
  private cachePrefix = 'analytics:';

  constructor() {
    this.prisma = prisma;
  }

  // Track user event
  async trackEvent(event: UserEvent): Promise<void> {
    try {
      // Store in database
      await this.prisma.userEvent.create({
        data: {
          userId: event.userId || null,
          sessionId: event.sessionId,
          eventType: event.eventType,
          productId: event.productId || null,
          categoryId: event.categoryId || null,
          searchQuery: event.searchQuery || null,
          // SQLite stores the metadata as a JSON string.
          metadata: JSON.stringify(event.metadata || {}),
          timestamp: event.timestamp || new Date(),
          userAgent: event.userAgent || null,
          ipAddress: event.ipAddress || null,
        },
      });

      // Also store in Redis for real-time analytics
      const cacheKey = `${this.cachePrefix}events:${event.sessionId}`;
      const existingEvents = await cache.get<UserEvent[]>(cacheKey) || [];
      existingEvents.push(event);
      
      // Keep only last 100 events per session
      if (existingEvents.length > 100) {
        existingEvents.splice(0, existingEvents.length - 100);
      }
      
      await cache.set(cacheKey, existingEvents, 86400); // 24 hours

      // Update real-time counters
      await this.updateRealTimeCounters(event);

      logger.debug(`Analytics event tracked: ${event.eventType}`, {
        userId: event.userId,
        sessionId: event.sessionId,
        productId: event.productId,
      });
    } catch (error) {
      // Don't fail the request if analytics tracking fails
      logger.error('Error tracking analytics event:', error);
    }
  }

  // Track multiple events
  async trackEvents(events: UserEvent[]): Promise<void> {
    try {
      await this.prisma.userEvent.createMany({
        data: events.map(event => ({
          userId: event.userId || null,
          sessionId: event.sessionId,
          eventType: event.eventType,
          productId: event.productId || null,
          categoryId: event.categoryId || null,
          searchQuery: event.searchQuery || null,
          // SQLite stores the metadata as a JSON string.
          metadata: JSON.stringify(event.metadata || {}),
          timestamp: event.timestamp || new Date(),
          userAgent: event.userAgent || null,
          ipAddress: event.ipAddress || null,
        })),
      });

      logger.debug(`Tracked ${events.length} analytics events`);
    } catch (error) {
      logger.error('Error tracking analytics events:', error);
    }
  }

  // Get user behavior
  async getUserBehavior(userId: string, days: number = 30): Promise<any> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const events = await this.prisma.userEvent.findMany({
        where: {
          userId,
          timestamp: {
            gte: startDate,
          },
        },
        orderBy: {
          timestamp: 'desc',
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              price: true,
              // Needed by analyzeBehavior's category-preferences pass
              // (it reads event.product.category.name).
              category: { select: { name: true } },
              images: {
                where: { isPrimary: true },
                take: 1,
              },
            },
          },
        },
      });

      return this.analyzeBehavior(events);
    } catch (error) {
      logger.error(`Error getting user behavior for ${userId}:`, error);
      throw error;
    }
  }

  // Get product analytics
  async getProductAnalytics(productId: string, days: number = 30): Promise<any> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const [viewCount, cartCount, purchaseCount, wishlistCount] = await Promise.all([
        this.prisma.userEvent.count({
          where: {
            productId,
            eventType: 'view',
            timestamp: { gte: startDate },
          },
        }),
        this.prisma.userEvent.count({
          where: {
            productId,
            eventType: 'add_to_cart',
            timestamp: { gte: startDate },
          },
        }),
        this.prisma.userEvent.count({
          where: {
            productId,
            eventType: 'purchase',
            timestamp: { gte: startDate },
          },
        }),
        this.prisma.userEvent.count({
          where: {
            productId,
            eventType: 'wishlist',
            timestamp: { gte: startDate },
          },
        }),
      ]);

      // Calculate conversion rates
      const viewToCartRate = viewCount > 0 ? (cartCount / viewCount) * 100 : 0;
      const cartToPurchaseRate = cartCount > 0 ? (purchaseCount / cartCount) * 100 : 0;

      return {
        productId,
        period: `${days} days`,
        metrics: {
          views: viewCount,
          addToCart: cartCount,
          purchases: purchaseCount,
          wishlist: wishlistCount,
        },
        conversionRates: {
          viewToCart: Math.round(viewToCartRate * 100) / 100,
          cartToPurchase: Math.round(cartToPurchaseRate * 100) / 100,
        },
      };
    } catch (error) {
      logger.error(`Error getting product analytics for ${productId}:`, error);
      throw error;
    }
  }

  // Get search analytics
  async getSearchAnalytics(days: number = 30): Promise<any> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const searchQueries = await this.prisma.userEvent.groupBy({
        by: ['searchQuery'],
        where: {
          eventType: 'search',
          timestamp: { gte: startDate },
          searchQuery: { not: null },
        },
        _count: {
          searchQuery: true,
        },
        orderBy: {
          _count: {
            searchQuery: 'desc',
          },
        },
        take: 50,
      });

      return searchQueries.map(sq => ({
        query: sq.searchQuery,
        count: sq._count.searchQuery,
      }));
    } catch (error) {
      logger.error('Error getting search analytics:', error);
      throw error;
    }
  }

  // Get trending products
  async getTrendingProducts(limit: number = 10, days: number = 7): Promise<any[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const trending = await this.prisma.userEvent.groupBy({
        by: ['productId'],
        where: {
          eventType: 'view',
          timestamp: { gte: startDate },
          productId: { not: null },
        },
        _count: {
          productId: true,
        },
        orderBy: {
          _count: {
            productId: 'desc',
          },
        },
        take: limit,
      });

      const productIds = trending.map(t => t.productId).filter((id): id is string => id !== null);

      const products = await this.prisma.product.findMany({
        where: {
          id: { in: productIds },
          status: 'active',
        },
        include: {
          images: {
            where: { isPrimary: true },
            take: 1,
          },
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });

      // Maintain trending order
      const productMap = new Map(products.map(p => [p.id, p]));
      return productIds
        .map(id => productMap.get(id))
        .filter((p): p is NonNullable<typeof p> => p !== undefined);
    } catch (error) {
      logger.error('Error getting trending products:', error);
      throw error;
    }
  }

  // Analyze user behavior
  private analyzeBehavior(events: any[]): any {
    const viewedProducts = new Map<string, number>();
    const purchasedProducts: string[] = [];
    const searchQueries: string[] = [];
    const categoryPreferences = new Map<string, number>();

    events.forEach(event => {
      switch (event.eventType) {
        case 'view':
          if (event.productId) {
            viewedProducts.set(event.productId, (viewedProducts.get(event.productId) || 0) + 1);
          }
          break;
        case 'purchase':
          if (event.productId) {
            purchasedProducts.push(event.productId);
          }
          break;
        case 'search':
          if (event.searchQuery) {
            searchQueries.push(event.searchQuery);
          }
          break;
      }

      // Track category preferences
      if (event.product?.category?.name) {
        const category = event.product.category.name;
        categoryPreferences.set(category, (categoryPreferences.get(category) || 0) + 1);
      }
    });

    // Sort viewed products by view count
    const sortedViewedProducts = Array.from(viewedProducts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([productId, count]) => ({ productId, viewCount: count }));

    // Get unique search queries
    const uniqueSearchQueries = [...new Set(searchQueries)];

    // Sort category preferences
    const sortedCategoryPreferences = Array.from(categoryPreferences.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => ({ category, interactionCount: count }));

    return {
      viewedProducts: sortedViewedProducts,
      purchasedProducts: [...new Set(purchasedProducts)],
      searchQueries: uniqueSearchQueries,
      categoryPreferences: sortedCategoryPreferences,
      totalEvents: events.length,
    };
  }

  // Update real-time counters
  private async updateRealTimeCounters(event: UserEvent): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Daily event counter
      const dailyKey = `${this.cachePrefix}daily:${today}:${event.eventType}`;
      await cache.set(dailyKey, ((await cache.get<number>(dailyKey)) || 0) + 1, 86400);

      // Product view counter
      if (event.productId && event.eventType === 'view') {
        const productKey = `${this.cachePrefix}product:${event.productId}:views`;
        await cache.set(productKey, ((await cache.get<number>(productKey)) || 0) + 1, 86400);
      }

      // Search query counter
      if (event.searchQuery && event.eventType === 'search') {
        const searchKey = `${this.cachePrefix}search:${event.searchQuery}`;
        await cache.set(searchKey, ((await cache.get<number>(searchKey)) || 0) + 1, 86400);
      }
    } catch (error) {
      logger.error('Error updating real-time counters:', error);
    }
  }

  // Get real-time stats
  async getRealTimeStats(): Promise<any> {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const [views, searches, addToCarts, purchases] = await Promise.all([
        cache.get<number>(`${this.cachePrefix}daily:${today}:view`) || 0,
        cache.get<number>(`${this.cachePrefix}daily:${today}:search`) || 0,
        cache.get<number>(`${this.cachePrefix}daily:${today}:add_to_cart`) || 0,
        cache.get<number>(`${this.cachePrefix}daily:${today}:purchase`) || 0,
      ]);

      return {
        date: today,
        metrics: {
          views,
          searches,
          addToCarts,
          purchases,
        },
      };
    } catch (error) {
      logger.error('Error getting real-time stats:', error);
      throw error;
    }
  }
}

export default new AnalyticsService();