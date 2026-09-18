/**
 * groupBy aggregate support in the test double.
 *
 * The mock implemented `_count` but ignored `_sum`, `_avg`, `orderBy` and
 * `take`. Every caller using them - the dashboard's best-sellers card and the
 * sales report's top products - therefore received rows with no `_sum` key and
 * would have thrown on `g._sum.quantity`. No test caught it because no test
 * ever reached that code path with data.
 *
 * These tests pin the aggregate behaviour so the double cannot quietly drift
 * from the real client again.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mockPrisma, resetMockPrisma } from '../helpers/mockPrisma';

beforeEach(async () => {
  await resetMockPrisma();
  const rows = [
    { id: 'a1', orderId: 'o1', productId: 'p1', quantity: 2, unitPrice: 5, totalPrice: 10 },
    { id: 'a2', orderId: 'o1', productId: 'p1', quantity: 3, unitPrice: 5, totalPrice: 15 },
    { id: 'a3', orderId: 'o2', productId: 'p2', quantity: 1, unitPrice: 50, totalPrice: 50 },
    { id: 'a4', orderId: 'o2', productId: 'p3', quantity: 7, unitPrice: 1, totalPrice: 7 },
  ];
  for (const data of rows) await mockPrisma.orderItem.create({ data });
});

describe('mockPrisma groupBy', () => {
  it('sums grouped numeric fields', async () => {
    const g = await mockPrisma.orderItem.groupBy({
      by: ['productId'], _sum: { quantity: true, totalPrice: true },
    });
    const p1 = g.find((r: any) => r.productId === 'p1');
    expect(p1._sum.quantity).toBe(5);
    expect(p1._sum.totalPrice).toBe(25);
  });

  it('orders by an aggregate, descending', async () => {
    const g = await mockPrisma.orderItem.groupBy({
      by: ['productId'],
      _sum: { totalPrice: true },
      orderBy: { _sum: { totalPrice: 'desc' } },
    });
    expect(g.map((r: any) => r.productId)).toEqual(['p2', 'p1', 'p3']);
  });

  it('applies take after ordering, so "top N" is really the top N', async () => {
    const g = await mockPrisma.orderItem.groupBy({
      by: ['productId'],
      _sum: { totalPrice: true },
      orderBy: { _sum: { totalPrice: 'desc' } },
      take: 2,
    });
    expect(g).toHaveLength(2);
    expect(g[0].productId).toBe('p2');
  });

  it('still supports _count alongside _sum', async () => {
    const g = await mockPrisma.orderItem.groupBy({
      by: ['productId'], _count: { _all: true }, _sum: { quantity: true },
    });
    const p1 = g.find((r: any) => r.productId === 'p1');
    expect(p1._count._all).toBe(2);
    expect(p1._sum.quantity).toBe(5);
  });

  it('averages', async () => {
    const g = await mockPrisma.orderItem.groupBy({
      by: ['productId'], _avg: { unitPrice: true },
    });
    expect(g.find((r: any) => r.productId === 'p1')._avg.unitPrice).toBe(5);
  });

  it('returns null, like Prisma, when a summed field is entirely null', async () => {
    await mockPrisma.orderItem.create({
      data: { id: 'n1', orderId: 'o9', productId: 'pnull', quantity: null, unitPrice: 1, totalPrice: 1 },
    });
    const g = await mockPrisma.orderItem.groupBy({
      by: ['productId'], _sum: { quantity: true },
    });
    expect(g.find((r: any) => r.productId === 'pnull')._sum.quantity).toBeNull();
  });
});
