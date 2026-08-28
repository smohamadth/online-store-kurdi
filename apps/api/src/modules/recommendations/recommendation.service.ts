import { PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';
import { cache } from '../../config/redis';
import { logger } from '../../utils/logger';
import { AnalyticsService } from '../analytics/analytics.service';

export class RecommendationService {
  private prisma: PrismaClient;
  private analyticsService: AnalyticsService;
  private cachePrefix = 'recommendations:';
  private cacheTTL = 1800; // 30 minutes

  constructor() {
    this.prisma = prisma;
    this.analyticsService = new AnalyticsService();
  }

  // Get "Customers also bought" recommendations
  async getAlsoBought(productId: string, limit: number = 6): Promise<any[]> {
    try {
      const cacheKey = `${this.cachePrefix}also-bought:${productId}:${limit}`;
      const cached = await cache.get<any[]>(cacheKey);
      if (cached) {
        return cached;
      }

      // Find users who bought this product
      const purchases = await this.prisma.userEvent.findMany({
        where: {
          eventType: 'purchase',
          productId: productId,
        },
        select: { userId: true },
        distinct: ['userId'],
      });

      const userIds = purchases.map(p => p.userId).filter((id): id is string => id !== null);

      if (userIds.length === 0) {
        // Fallback: get products from same category
        return this.getFallbackRecommendations(productId, limit);
      }

      // Find other products these users bought
      const alsoBought = await this.prisma.userEvent.groupBy({
        by: ['productId'],
        where: {
          eventType: 'purchase',
          userId: { in: userIds },
          productId: { not: productId },
        },
        _count: {
          productId: true,
        },
        orderBy: {
          _count: {
            productId: 'desc',
          },
        },
        take: limit * 2, // Get more to filter
      });

      const productIds = alsoBought
        .map(ab => ab.productId)
        .filter((id): id is string => id !== null)
        .slice(0, limit);

      if (productIds.length === 0) {
        return this.getFallbackRecommendations(productId, limit);
      }

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

      // Maintain order
      const productMap = new Map(products.map(p => [p.id, p]));
      const result = productIds
        .map(id => productMap.get(id))
        .filter((p): p is NonNullable<typeof p> => p !== undefined);

      await cache.set(cacheKey, result, this.cacheTTL);

      return result;
    } catch (error) {
      logger.error(`Error getting also bought recommendations for ${productId}:`, error);
      return this.getFallbackRecommendations(productId, limit);
    }
  }

  // Get "Based on your browsing history" recommendations
  async getBasedOnHistory(userId: string, limit: number = 6): Promise<any[]> {
    try {
      const cacheKey = `${this.cachePrefix}history:${userId}:${limit}`;
      const cached = await cache.get<any[]>(cacheKey);
      if (cached) {
        return cached;
      }

      // Get user's recent views
      const recentViews = await this.prisma.userEvent.findMany({
        where: {
          userId,
          eventType: 'view',
          timestamp: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          },
        },
        select: { productId: true },
        orderBy: { timestamp: 'desc' },
        take: 20,
      });

      const viewedProductIds = recentViews
        .map(rv => rv.productId)
        .filter((id): id is string => id !== null);

      if (viewedProductIds.length === 0) {
        return this.getTrending(limit);
      }

      // Get categories of viewed products
      const viewedProducts = await this.prisma.product.findMany({
        where: { id: { in: viewedProductIds } },
        select: { categoryId: true },
      });

      const categoryIds = [...new Set(viewedProducts.map(p => p.categoryId))];

      // Get products from same categories
      const products = await this.prisma.product.findMany({
        where: {
          categoryId: { in: categoryIds },
          status: 'active',
          id: { notIn: viewedProductIds },
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
        take: limit,
        orderBy: { createdAt: 'desc' },
      });

      await cache.set(cacheKey, products, this.cacheTTL);

      return products;
    } catch (error) {
      logger.error(`Error getting history-based recommendations for ${userId}:`, error);
      return this.getTrending(limit);
    }
  }

  // Get "Trending products" recommendations
  async getTrending(limit: number = 10): Promise<any[]> {
    try {
      const cacheKey = `${this.cachePrefix}trending:${limit}`;
      const cached = await cache.get<any[]>(cacheKey);
      if (cached) {
        return cached;
      }

      const products = await this.analyticsService.getTrendingProducts(limit, 7);

      await cache.set(cacheKey, products, this.cacheTTL);

      return products;
    } catch (error) {
      logger.error('Error getting trending recommendations:', error);
      return this.getFallbackTrending(limit);
    }
  }

  // Get "New arrivals" recommendations
  async getNewArrivals(limit: number = 10): Promise<any[]> {
    try {
      const cacheKey = `${this.cachePrefix}new-arrivals:${limit}`;
      const cached = await cache.get<any[]>(cacheKey);
      if (cached) {
        return cached;
      }

      const products = await this.prisma.product.findMany({
        where: {
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
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      await cache.set(cacheKey, products, this.cacheTTL);

      return products;
    } catch (error) {
      logger.error('Error getting new arrivals:', error);
      throw error;
    }
  }

  // Get "Frequently bought together" recommendations
  async getFrequentlyBoughtTogether(productId: string, limit: number = 4): Promise<any[]> {
    try {
      const cacheKey = `${this.cachePrefix}bought-together:${productId}:${limit}`;
      const cached = await cache.get<any[]>(cacheKey);
      if (cached) {
        return cached;
      }

      // Find orders containing this product
      const orderItems = await this.prisma.orderItem.findMany({
        where: {
          productId: productId,
        },
        select: { orderId: true },
        distinct: ['orderId'],
      });

      const orderIds = orderItems.map(oi => oi.orderId);

      if (orderIds.length === 0) {
        return this.getFallbackRecommendations(productId, limit);
      }

      // Find other products in these orders
      const otherItems = await this.prisma.orderItem.groupBy({
        by: ['productId'],
        where: {
          orderId: { in: orderIds },
          productId: { not: productId },
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

      const productIds = otherItems
        .map(item => item.productId)
        .filter((id): id is string => id !== null);

      if (productIds.length === 0) {
        return this.getFallbackRecommendations(productId, limit);
      }

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

      const productMap = new Map(products.map(p => [p.id, p]));
      const result = productIds
        .map(id => productMap.get(id))
        .filter((p): p is NonNullable<typeof p> => p !== undefined);

      await cache.set(cacheKey, result, this.cacheTTL);

      return result;
    } catch (error) {
      logger.error(`Error getting frequently bought together for ${productId}:`, error);
      return this.getFallbackRecommendations(productId, limit);
    }
  }

  // Get personalized recommendations for homepage
  async getPersonalizedRecommendations(userId?: string, limit: number = 12): Promise<any> {
    try {
      const recommendations: any = {
        trending: await this.getTrending(limit),
        newArrivals: await this.getNewArrivals(limit),
      };

      if (userId) {
        recommendations.basedOnHistory = await this.getBasedOnHistory(userId, limit);
      }

      return recommendations;
    } catch (error) {
      logger.error('Error getting personalized recommendations:', error);
      throw error;
    }
  }

  // Log recommendation click
  async logRecommendationClick(
    userId: string | null,
    sessionId: string,
    recommendationType: string,
    productId: string,
    algorithmVersion: string = 'v1'
  ): Promise<void> {
    try {
      await this.prisma.recommendationLog.create({
        data: {
          userId: userId || null,
          sessionId,
          recommendationType,
          algorithmVersion,
          // JSON array of product IDs (SQLite stores it as a string).
          products: JSON.stringify([productId]),
          clicked: true,
          timestamp: new Date(),
        },
      });

      logger.debug(`Recommendation click logged: ${recommendationType} - ${productId}`);
    } catch (error) {
      logger.error('Error logging recommendation click:', error);
    }
  }

  // Log recommendation purchase
  async logRecommendationPurchase(
    userId: string,
    sessionId: string,
    recommendationType: string,
    productId: string
  ): Promise<void> {
    try {
      await this.prisma.recommendationLog.create({
        data: {
          userId,
          sessionId,
          recommendationType,
          algorithmVersion: 'v1',
          // JSON array of product IDs (SQLite stores it as a string).
          products: JSON.stringify([productId]),
          purchased: true,
          timestamp: new Date(),
        },
      });

      logger.debug(`Recommendation purchase logged: ${recommendationType} - ${productId}`);
    } catch (error) {
      logger.error('Error logging recommendation purchase:', error);
    }
  }

  // Get recommendation analytics
  async getRecommendationAnalytics(days: number = 30): Promise<any> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Prisma cannot `_sum` boolean columns (clicked/purchased), so
      // per-type clicks and purchases come from their own groupBy
      // counts instead of an aggregate on the flag.
      const [totalClicks, totalPurchases, byType, clicksByType, purchasesByType] = await Promise.all([
        this.prisma.recommendationLog.count({
          where: {
            clicked: true,
            timestamp: { gte: startDate },
          },
        }),
        this.prisma.recommendationLog.count({
          where: {
            purchased: true,
            timestamp: { gte: startDate },
          },
        }),
        this.prisma.recommendationLog.groupBy({
          by: ['recommendationType'],
          where: {
            timestamp: { gte: startDate },
          },
          _count: {
            id: true,
          },
        }),
        this.prisma.recommendationLog.groupBy({
          by: ['recommendationType'],
          where: {
            timestamp: { gte: startDate },
            clicked: true,
          },
          _count: {
            id: true,
          },
        }),
        this.prisma.recommendationLog.groupBy({
          by: ['recommendationType'],
          where: {
            timestamp: { gte: startDate },
            purchased: true,
          },
          _count: {
            id: true,
          },
        }),
      ]);

      const conversionRate = totalClicks > 0 ? (totalPurchases / totalClicks) * 100 : 0;
      const countForType = (
        rows: Array<{ recommendationType: string; _count: { id: number } }>,
        type: string,
      ) => rows.find((r) => r.recommendationType === type)?._count.id ?? 0;

      return {
        period: `${days} days`,
        totalClicks,
        totalPurchases,
        conversionRate: Math.round(conversionRate * 100) / 100,
        byType: byType.map(type => ({
          type: type.recommendationType,
          impressions: type._count.id,
          clicks: countForType(clicksByType, type.recommendationType),
          purchases: countForType(purchasesByType, type.recommendationType),
        })),
      };
    } catch (error) {
      logger.error('Error getting recommendation analytics:', error);
      throw error;
    }
  }

  // Fallback recommendations when no data is available
  private async getFallbackRecommendations(productId: string, limit: number): Promise<any[]> {
    try {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        select: { categoryId: true },
      });

      if (!product) {
        return this.getFallbackTrending(limit);
      }

      const products = await this.prisma.product.findMany({
        where: {
          categoryId: product.categoryId,
          status: 'active',
          id: { not: productId },
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
        take: limit,
        orderBy: { createdAt: 'desc' },
      });

      return products;
    } catch (error) {
      logger.error('Error getting fallback recommendations:', error);
      return this.getFallbackTrending(limit);
    }
  }

  // Fallback trending when analytics data is unavailable
  private async getFallbackTrending(limit: number): Promise<any[]> {
    try {
      const products = await this.prisma.product.findMany({
        where: {
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
        take: limit,
        orderBy: { createdAt: 'desc' },
      });

      return products;
    } catch (error) {
      logger.error('Error getting fallback trending:', error);
      return [];
    }
  }
}

export default new RecommendationService();