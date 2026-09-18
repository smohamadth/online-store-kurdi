/**
 * Admin sales report: data assembly.
 *
 * Follows the same shape as the order receipt (`orders/receipt.service.ts`):
 * one impure function that gathers rows, returning a plain data object that
 * the renderers (JSON / CSV / PDF) consume. Keeping assembly separate from
 * rendering means the PDF layout can be changed without touching a query, and
 * the arithmetic is unit-tested in `report.helpers.ts` without a database.
 *
 * All money figures deliberately exclude cancelled and refunded orders, the
 * same rule `/api/dashboard/stats` uses. Reporting a different revenue total
 * on two admin screens is a support ticket waiting to happen.
 */
import { prisma } from '../../config/database';
import {
  bucketRevenue,
  computeDelta,
  pickGranularity,
  round2,
  type Delta,
  type RevenueBucket,
} from './report.helpers';

/** Orders that represent real money. Cancelled/refunded are excluded. */
export const REVENUE_STATUSES = ['pending', 'processing', 'shipped', 'delivered'];

export type ReportRange = { from: Date; to: Date; days: number };

export type SalesReport = {
  store: { name: string; email: string | null; currencySymbol: string };
  range: { from: string; to: string; days: number; granularity: 'day' | 'month' };
  generatedAt: string;
  totals: {
    revenue: number;
    orders: number;
    averageOrderValue: number;
    unitsSold: number;
    newCustomers: number;
  };
  /** Period-over-period comparison against the immediately preceding window. */
  deltas: {
    revenue: Delta;
    orders: Delta;
    averageOrderValue: Delta;
    newCustomers: Delta;
  };
  series: RevenueBucket[];
  ordersByStatus: Record<string, number>;
  topProducts: {
    id: string; name: string; sku: string | null; sold: number; revenue: number;
  }[];
  topCustomers: {
    id: string; name: string; email: string; orders: number; revenue: number;
  }[];
  lowStock: { id: string; name: string; sku: string | null; quantity: number }[];
  payments: { method: string; orders: number; revenue: number }[];
};

/**
 * Resolve a range from query params.
 *
 * Accepts either explicit from/to dates or a `days` lookback. Invalid or
 * reversed input falls back to the default window rather than throwing —
 * a mistyped URL should not 500 an admin dashboard.
 */
export function resolveRange(query: any, defaultDays = 30): ReportRange {
  const to = parseDate(query?.to) ?? new Date();
  let from = parseDate(query?.from);

  if (!from) {
    const raw = Number(query?.days);
    const days = Number.isFinite(raw) && raw >= 1 && raw <= 3650 ? Math.floor(raw) : defaultDays;
    from = new Date(to);
    from.setUTCDate(from.getUTCDate() - days);
  }

  // Reversed range: swap rather than return a negative span.
  if (from > to) [from, to as any] = [to, from];

  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000));
  return { from, to, days };
}

function parseDate(value: any): Date | null {
  if (!value || typeof value !== 'string') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Assemble the full report. */
export async function assembleSalesReport(range: ReportRange): Promise<SalesReport> {
  const { from, to, days } = range;

  // The preceding window of equal length, for the period-over-period deltas
  // that replaced the hardcoded "↑ 12% from last month" captions.
  const prevTo = new Date(from);
  const prevFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));

  const paid = { status: { in: REVENUE_STATUSES } };

  const [
    settings,
    orders,
    prevOrders,
    statusRaw,
    newCustomers,
    prevNewCustomers,
    lowStockRows,
  ] = await Promise.all([
    prisma.storeSettings.findUnique({ where: { id: 'default' } }).catch(() => null),
    prisma.order.findMany({
      where: { ...paid, createdAt: { gte: from, lte: to } },
      select: { id: true, createdAt: true, totalAmount: true, paymentMethod: true, userId: true },
    }),
    prisma.order.findMany({
      where: { ...paid, createdAt: { gte: prevFrom, lt: prevTo } },
      select: { totalAmount: true },
    }),
    prisma.order.groupBy({
      by: ['status'],
      where: { createdAt: { gte: from, lte: to } },
      _count: { _all: true },
    }).catch(() => [] as any[]),
    prisma.user.count({ where: { role: 'customer', createdAt: { gte: from, lte: to } } }),
    prisma.user.count({ where: { role: 'customer', createdAt: { gte: prevFrom, lt: prevTo } } }),
    prisma.product.findMany({
      where: { quantity: { lte: 5 } },
      select: { id: true, name: true, sku: true, quantity: true },
      orderBy: { quantity: 'asc' },
      take: 20,
    }),
  ]);

  const revenue = round2(orders.reduce((s: number, o: any) => s + (Number(o.totalAmount) || 0), 0));
  const prevRevenue = round2(prevOrders.reduce((s: number, o: any) => s + (Number(o.totalAmount) || 0), 0));
  const aov = orders.length ? round2(revenue / orders.length) : 0;
  const prevAov = prevOrders.length ? round2(prevRevenue / prevOrders.length) : 0;

  const ordersByStatus: Record<string, number> = {};
  for (const row of statusRaw as any[]) ordersByStatus[row.status] = row._count._all;

  // Payment method mix, computed in JS: `paymentMethod` is nullable and free
  // text, so grouping in SQL would split "cod" and null into odd buckets.
  const byMethod = new Map<string, { orders: number; revenue: number }>();
  for (const o of orders as any[]) {
    const key = o.paymentMethod || 'unspecified';
    const cur = byMethod.get(key) || { orders: 0, revenue: 0 };
    cur.orders += 1;
    cur.revenue = round2(cur.revenue + (Number(o.totalAmount) || 0));
    byMethod.set(key, cur);
  }
  const payments = [...byMethod.entries()]
    .map(([method, v]) => ({ method, ...v }))
    .sort((a, b) => b.revenue - a.revenue);

  const orderIds = orders.map((o: any) => o.id);
  const topProducts = await topProductsFor(orderIds);
  const topCustomers = await topCustomersFor(orders as any);

  const unitsSold = topProducts.reduce((s: number, p: any) => s + p.sold, 0);

  const granularity = pickGranularity(days);

  return {
    store: {
      name: (settings as any)?.storeName || 'Store',
      email: (settings as any)?.storeEmail || null,
      currencySymbol: (settings as any)?.currencySymbol || '$',
    },
    range: {
      from: from.toISOString(),
      to: to.toISOString(),
      days,
      granularity,
    },
    generatedAt: new Date().toISOString(),
    totals: {
      revenue,
      orders: orders.length,
      averageOrderValue: aov,
      unitsSold,
      newCustomers,
    },
    deltas: {
      revenue: computeDelta(revenue, prevRevenue),
      orders: computeDelta(orders.length, prevOrders.length),
      averageOrderValue: computeDelta(aov, prevAov),
      newCustomers: computeDelta(newCustomers, prevNewCustomers),
    },
    series: bucketRevenue(orders, from, to, granularity),
    ordersByStatus,
    topProducts,
    topCustomers,
    lowStock: lowStockRows.map((p: any) => ({
      id: p.id, name: p.name, sku: p.sku ?? null, quantity: p.quantity ?? 0,
    })),
    payments,
  };
}

async function topProductsFor(orderIds: string[]) {
  if (orderIds.length === 0) return [];
  const grouped = await prisma.orderItem.groupBy({
    by: ['productId'],
    where: { orderId: { in: orderIds } },
    _sum: { quantity: true, totalPrice: true },
    orderBy: { _sum: { totalPrice: 'desc' } },
    take: 10,
  });
  const ids = grouped.map((g: any) => g.productId).filter(Boolean);
  const products = ids.length
    ? await prisma.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, sku: true },
      })
    : [];
  return grouped.map((g: any) => {
    const p = products.find((x: any) => x.id === g.productId);
    return {
      id: g.productId,
      // A deleted product still has order history; name it rather than
      // dropping the row, so revenue in this table reconciles with the total.
      name: p?.name ?? 'Deleted product',
      sku: p?.sku ?? null,
      sold: g._sum.quantity ?? 0,
      revenue: round2(g._sum.totalPrice ?? 0),
    };
  });
}

async function topCustomersFor(orders: { userId: string; totalAmount: number | null }[]) {
  const byUser = new Map<string, { orders: number; revenue: number }>();
  for (const o of orders) {
    if (!o.userId) continue;
    const cur = byUser.get(o.userId) || { orders: 0, revenue: 0 };
    cur.orders += 1;
    cur.revenue = round2(cur.revenue + (Number(o.totalAmount) || 0));
    byUser.set(o.userId, cur);
  }
  const top = [...byUser.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 10);
  if (top.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: top.map(([id]) => id) } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  return top.map(([id, v]) => {
    const u = users.find((x: any) => x.id === id);
    return {
      id,
      name: u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || 'Customer' : 'Deleted customer',
      email: u?.email ?? '',
      orders: v.orders,
      revenue: v.revenue,
    };
  });
}
