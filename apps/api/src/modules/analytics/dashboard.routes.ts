import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { parseDays } from '../../utils/pagination';

const router = Router();

/**
 * GET /api/dashboard/stats
 *
 * Real store KPIs computed from the database.
 *
 * The admin dashboard and analytics pages previously derived these numbers in
 * the browser by pulling the first 100 products plus the orders list, and then
 * INVENTED "revenue" and "units sold" per product with Math.random(). Those
 * figures changed on every refresh and were never real.
 */
router.get('/stats', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const days = parseDays(req.query.days, 30, 365);
    const since = new Date();
    since.setDate(since.getDate() - days);

    // Cancelled/refunded orders must not count toward revenue.
    const REVENUE_STATUSES = ['pending', 'processing', 'shipped', 'delivered'];

    const [
      totalProducts,
      activeProducts,
      totalCustomers,
      totalOrders,
      revenueAgg,
      periodRevenueAgg,
      ordersByStatusRaw,
      lowStock,
      pendingReviews,
      recentOrders,
    ] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: { status: 'active' } }),
      prisma.user.count({ where: { role: 'customer' } }),
      prisma.order.count(),
      prisma.order.aggregate({
        where: { status: { in: REVENUE_STATUSES } },
        _sum: { totalAmount: true },
        _avg: { totalAmount: true },
      }),
      prisma.order.aggregate({
        where: { status: { in: REVENUE_STATUSES }, createdAt: { gte: since } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.product.count({ where: { quantity: { lte: 5 } } }),
      prisma.review.count({ where: { isApproved: false } }),
      prisma.order.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
    ]);

    const ordersByStatus: Record<string, number> = {};
    for (const row of ordersByStatusRaw) {
      ordersByStatus[row.status] = row._count._all;
    }

    // Best sellers: real units sold and real revenue, aggregated from OrderItem.
    const grouped = await prisma.orderItem.groupBy({
      by: ['productId'],
      _sum: { quantity: true, totalPrice: true },
      orderBy: { _sum: { totalPrice: 'desc' } },
      take: 5,
    });

    const productIds = grouped.map((g) => g.productId);
    const products = productIds.length
      ? await prisma.product.findMany({
          where: { id: { in: productIds } },
          select: {
            id: true,
            name: true,
            slug: true,
            price: true,
            quantity: true,
            images: { take: 1, orderBy: { sortOrder: 'asc' }, select: { url: true } },
          },
        })
      : [];

    let topProducts = grouped.map((g) => {
      const p = products.find((x) => x.id === g.productId);
      return {
        id: g.productId,
        name: p?.name ?? 'Unknown product',
        slug: p?.slug ?? '',
        price: p?.price ?? 0,
        stock: p?.quantity ?? 0,
        image: p?.images?.[0]?.url ?? null,
        sold: g._sum.quantity ?? 0,
        revenue: g._sum.totalPrice ?? 0,
      };
    });

    // Best sellers come from OrderItem, so a store with no sales yet produced
    // an EMPTY list - and the dashboard card rendered "No products yet" even
    // when the catalogue was full. That reads as data loss to a shop owner who
    // has just added ten products.
    //
    // With no sales, fall back to the newest products so the card shows the
    // real catalogue. `basis` tells the UI which it is looking at, so it can
    // label the card honestly instead of claiming zero-sold items are "top".
    const topProductsBasis = topProducts.length > 0 ? 'sales' : 'newest';

    if (topProducts.length === 0) {
      const newest = await prisma.product.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          quantity: true,
          images: { take: 1, orderBy: { sortOrder: 'asc' }, select: { url: true } },
        },
      });
      topProducts = newest.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        price: p.price,
        stock: p.quantity ?? 0,
        image: p.images?.[0]?.url ?? null,
        sold: 0,
        revenue: 0,
      }));
    }

    res.json({
      status: 'success',
      data: {
        totalProducts,
        activeProducts,
        totalCustomers,
        totalOrders,
        totalRevenue: revenueAgg._sum.totalAmount ?? 0,
        averageOrderValue: revenueAgg._avg.totalAmount ?? 0,
        periodDays: days,
        periodRevenue: periodRevenueAgg._sum.totalAmount ?? 0,
        periodOrders: periodRevenueAgg._count ?? 0,
        ordersByStatus,
        lowStockCount: lowStock,
        pendingReviews,
        topProductsBasis,
        topProducts,
        recentOrders,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
