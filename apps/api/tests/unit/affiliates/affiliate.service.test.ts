/**
 * Unit tests for the affiliate service's money logic with a mocked prisma.
 *
 * The integration test covers the full HTTP lifecycle; these tests pin the
 * service-level rules that the routes rely on:
 *   - createCommissionForOrder: attribution, rate precedence, idempotency,
 *     never-throws contract, suspended-affiliate rule
 *   - approve/reject commission: atomic status transitions + totalEarned
 *   - approvePayout: balance guard + totalPaid increment
 *   - applyAsAffiliate: program switch, duplicate apply, code retry
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    order: { findUnique: fn() },
    affiliate: { findUnique: fn(), update: fn(), updateMany: fn(), create: fn() },
    affiliateClick: { create: fn() },
    affiliateCommission: { findUnique: fn(), create: fn(), updateMany: fn(), findMany: fn() },
    affiliatePayout: { findUnique: fn(), updateMany: fn(), findMany: fn() },
    storeSettings: { findUnique: fn() },
    // Interactive transaction; implementation is re-attached in beforeEach
    // (impls declared inside vi.hoisted are dropped by vitest).
    $transaction: fn(),
  };
});

vi.mock('../../../src/config/database', () => ({
  prisma: mocks,
}));

import { prisma } from '../../../src/config/database';
import {
  createCommissionForOrder,
  applyAsAffiliate,
  approveCommission,
  rejectCommission,
  approvePayout,
  rejectPayout,
  setAffiliateStatus,
  setAffiliateRate,
  trackClick,
  voidCommission,
  voidCommissionForOrder,
} from '../../../src/modules/affiliates/affiliate.service';

/** Minimal fake rows (only the fields the service touches). */
function orderRow(overrides: Record<string, any> = {}) {
  return {
    id: 'o1',
    orderNumber: 'ORD-1',
    totalAmount: 200,
    paymentStatus: 'completed',
    affiliateId: 'aff1',
    affiliateCode: 'MARTIN-1',
    ...overrides,
  };
}
function affiliateRow(overrides: Record<string, any> = {}) {
  return {
    id: 'aff1',
    userId: 'u1',
    code: 'MARTIN-1',
    status: 'active',
    rateOverride: null,
    totalEarned: 0,
    totalPaid: 0,
    ...overrides,
  };
}

const settingsEnabled = { id: 'default', affiliateEnabled: true, affiliateRate: 10, currency: 'USD' };

beforeEach(() => {
  vi.clearAllMocks();
  // Sensible defaults: everything resolves undefined/null unless a test
  // overrides it. create* resolves a row so callers can return it.
  mocks.order.findUnique.mockResolvedValue(undefined);
  mocks.affiliate.findUnique.mockResolvedValue(undefined);
  mocks.affiliate.update.mockResolvedValue(undefined);
  mocks.affiliate.updateMany.mockResolvedValue({ count: 1 });
  mocks.affiliate.create.mockResolvedValue(undefined);
  mocks.affiliateClick.create.mockResolvedValue(undefined);
  mocks.affiliateCommission.findUnique.mockResolvedValue(undefined);
  mocks.affiliateCommission.create.mockResolvedValue(undefined);
  mocks.affiliateCommission.updateMany.mockResolvedValue({ count: 1 });
  mocks.affiliateCommission.findMany.mockResolvedValue([]);
  mocks.affiliatePayout.findUnique.mockResolvedValue(undefined);
  mocks.affiliatePayout.updateMany.mockResolvedValue({ count: 1 });
  mocks.affiliatePayout.findMany.mockResolvedValue([]);
  mocks.storeSettings.findUnique.mockResolvedValue(undefined);
  // Interactive transaction: run the callback with the same delegates
  // (mirrors mockPrisma's $transaction behaviour). Declared here because
  // implementations attached inside vi.hoisted do not survive to test run.
  mocks.$transaction.mockImplementation((ops: any) => ops(mocks));
});

describe('createCommissionForOrder', () => {
  it('creates a pending commission at the store rate for a referred paid order', async () => {
    (prisma.order.findUnique as any).mockResolvedValue(orderRow());
    (prisma.affiliate.findUnique as any).mockResolvedValue(affiliateRow());
    (prisma.storeSettings.findUnique as any).mockResolvedValue(settingsEnabled);
    (prisma.affiliateCommission.findUnique as any).mockResolvedValue(null);
    (prisma.affiliateCommission.create as any).mockResolvedValue({ id: 'c1' });

    const result = await createCommissionForOrder('o1');

    expect(prisma.affiliateCommission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        affiliateId: 'aff1',
        orderId: 'o1',
        orderNumber: 'ORD-1',
        orderAmount: 200,
        rate: 10,
        amount: 20, // 200 * 10%
        status: 'pending',
        currency: 'USD',
      }),
    });
    expect(result).toEqual({ id: 'c1' });
  });

  it('prefers the affiliate rate override over the store default', async () => {
    (prisma.order.findUnique as any).mockResolvedValue(orderRow());
    (prisma.affiliate.findUnique as any).mockResolvedValue(affiliateRow({ rateOverride: 25 }));
    (prisma.storeSettings.findUnique as any).mockResolvedValue(settingsEnabled);
    (prisma.affiliateCommission.findUnique as any).mockResolvedValue(null);
    (prisma.affiliateCommission.create as any).mockResolvedValue({ id: 'c1' });

    await createCommissionForOrder('o1');

    const call = (prisma.affiliateCommission.create as any).mock.calls[0][0];
    expect(call.data.rate).toBe(25);
    expect(call.data.amount).toBe(50);
  });

  it('is a no-op for orders without attribution', async () => {
    (prisma.order.findUnique as any).mockResolvedValue(orderRow({ affiliateId: null, affiliateCode: null }));
    await createCommissionForOrder('o1');
    expect(prisma.affiliateCommission.create).not.toHaveBeenCalled();
  });

  it('is a no-op while the order is not yet paid', async () => {
    (prisma.order.findUnique as any).mockResolvedValue(orderRow({ paymentStatus: 'pending' }));
    await createCommissionForOrder('o1');
    expect(prisma.affiliateCommission.create).not.toHaveBeenCalled();
  });

  it('is a no-op when the affiliate is suspended at payment time', async () => {
    (prisma.order.findUnique as any).mockResolvedValue(orderRow());
    (prisma.affiliate.findUnique as any).mockResolvedValue(affiliateRow({ status: 'suspended' }));
    await createCommissionForOrder('o1');
    expect(prisma.affiliateCommission.create).not.toHaveBeenCalled();
  });

  it('is a no-op for a self-referral: the buyer IS the affiliate (farming guard)', async () => {
    // order.userId === affiliate.userId: the affiliate bought through
    // their own link — no commission.
    (prisma.order.findUnique as any).mockResolvedValue(orderRow({ userId: 'u1' }));
    (prisma.affiliate.findUnique as any).mockResolvedValue(affiliateRow({ userId: 'u1' }));
    await createCommissionForOrder('o1');
    expect(prisma.affiliateCommission.create).not.toHaveBeenCalled();
  });

  it('creates a commission when a DIFFERENT buyer uses the link', async () => {
    (prisma.order.findUnique as any).mockResolvedValue(orderRow({ userId: 'buyer-9' }));
    (prisma.affiliate.findUnique as any).mockResolvedValue(affiliateRow({ userId: 'u1' }));
    (prisma.storeSettings.findUnique as any).mockResolvedValue(settingsEnabled);
    (prisma.affiliateCommission.findUnique as any).mockResolvedValue(null);
    (prisma.affiliateCommission.create as any).mockResolvedValue({ id: 'c1' });
    const result = await createCommissionForOrder('o1');
    expect(result).toEqual({ id: 'c1' });
    expect(prisma.affiliateCommission.create).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when the commission rounds to zero (rate 0)', async () => {
    (prisma.order.findUnique as any).mockResolvedValue(orderRow());
    (prisma.affiliate.findUnique as any).mockResolvedValue(affiliateRow({ rateOverride: 0 }));
    (prisma.storeSettings.findUnique as any).mockResolvedValue(settingsEnabled);
    await createCommissionForOrder('o1');
    expect(prisma.affiliateCommission.create).not.toHaveBeenCalled();
  });

  it('is idempotent: returns the existing commission instead of a second row', async () => {
    (prisma.order.findUnique as any).mockResolvedValue(orderRow());
    (prisma.affiliate.findUnique as any).mockResolvedValue(affiliateRow());
    (prisma.storeSettings.findUnique as any).mockResolvedValue(settingsEnabled);
    const existing = { id: 'c1', status: 'pending' };
    (prisma.affiliateCommission.findUnique as any).mockResolvedValue(existing);

    const result = await createCommissionForOrder('o1');

    expect(result).toEqual(existing);
    expect(prisma.affiliateCommission.create).not.toHaveBeenCalled();
  });

  it('does NOT require the program switch to be on (orders placed while on still earn)', async () => {
    (prisma.order.findUnique as any).mockResolvedValue(orderRow());
    (prisma.affiliate.findUnique as any).mockResolvedValue(affiliateRow());
    (prisma.storeSettings.findUnique as any).mockResolvedValue({ ...settingsEnabled, affiliateEnabled: false });
    (prisma.affiliateCommission.findUnique as any).mockResolvedValue(null);
    (prisma.affiliateCommission.create as any).mockResolvedValue({ id: 'c1' });

    const result = await createCommissionForOrder('o1');
    expect(result).toEqual({ id: 'c1' });
  });

  it('NEVER throws — a DB hiccup returns null and cannot fail payment settlement', async () => {
    (prisma.order.findUnique as any).mockRejectedValue(new Error('db down'));
    await expect(createCommissionForOrder('o1')).resolves.toBeNull();
  });
});

describe('applyAsAffiliate', () => {
  it('creates a pending profile with a code when the program is enabled', async () => {
    (prisma.storeSettings.findUnique as any).mockResolvedValue(settingsEnabled);
    (prisma.affiliate.findUnique as any).mockResolvedValue(null);
    (prisma.affiliate.create as any).mockResolvedValue({ id: 'a1', code: 'SARA-1234', status: 'pending' });

    const result = await applyAsAffiliate('u1', 'Sara', 'Ali');

    expect(prisma.affiliate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'u1', status: 'pending', code: expect.stringMatching(/^SARAALI-[A-Z0-9]{4}$/) }),
    });
    expect(result.code).toBe('SARA-1234');
  });

  it('refuses when the program is disabled', async () => {
    (prisma.storeSettings.findUnique as any).mockResolvedValue({ ...settingsEnabled, affiliateEnabled: false });
    await expect(applyAsAffiliate('u1', 'Sara', 'Ali')).rejects.toThrow(/not enabled/i);
    expect(prisma.affiliate.create).not.toHaveBeenCalled();
  });

  it('refuses a duplicate application', async () => {
    (prisma.storeSettings.findUnique as any).mockResolvedValue(settingsEnabled);
    (prisma.affiliate.findUnique as any).mockResolvedValue({ id: 'a1', userId: 'u1' });
    await expect(applyAsAffiliate('u1', 'Sara', 'Ali')).rejects.toThrow(/already applied/i);
  });

  it('retries with a fresh code on a code collision (P2002)', async () => {
    (prisma.storeSettings.findUnique as any).mockResolvedValue(settingsEnabled);
    (prisma.affiliate.findUnique as any).mockResolvedValue(null);
    (prisma.affiliate.create as any)
      .mockRejectedValueOnce({ code: 'P2002' })
      .mockResolvedValueOnce({ id: 'a1', code: 'SARA-9999', status: 'pending' });

    const result = await applyAsAffiliate('u1', 'Sara', 'Ali');
    expect(prisma.affiliate.create).toHaveBeenCalledTimes(2);
    expect(result.id).toBe('a1');
  });
});

describe('approveCommission / rejectCommission', () => {
  it('approves a pending commission and increments totalEarned atomically', async () => {
    (prisma.affiliateCommission.findUnique as any).mockResolvedValue({ id: 'c1', affiliateId: 'aff1', status: 'pending', amount: 20 });
    (prisma.affiliateCommission.updateMany as any).mockResolvedValue({ count: 1 });
    (prisma.affiliate.update as any).mockResolvedValue({});
    (prisma.affiliateCommission.findUnique as any).mockResolvedValueOnce({ id: 'c1', affiliateId: 'aff1', status: 'pending', amount: 20 });

    await approveCommission('c1');

    expect(prisma.affiliateCommission.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', status: 'pending' },
      data: expect.objectContaining({ status: 'approved' }),
    });
    expect(prisma.affiliate.update).toHaveBeenCalledWith({
      where: { id: 'aff1' },
      data: { totalEarned: { increment: 20 } },
    });
  });

  it('refuses to approve a commission that is not pending', async () => {
    (prisma.affiliateCommission.findUnique as any).mockResolvedValue({ id: 'c1', status: 'approved' });
    await expect(approveCommission('c1')).rejects.toThrow(/already approved/i);
    expect(prisma.affiliate.update).not.toHaveBeenCalled();
  });

  it('rejects a pending commission without touching totalEarned', async () => {
    (prisma.affiliateCommission.findUnique as any).mockResolvedValue({ id: 'c1', affiliateId: 'aff1', status: 'pending', amount: 20 });
    (prisma.affiliateCommission.updateMany as any).mockResolvedValue({ count: 1 });
    await rejectCommission('c1');
    expect(prisma.affiliateCommission.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', status: 'pending' },
      data: { status: 'rejected' },
    });
    expect(prisma.affiliate.update).not.toHaveBeenCalled();
  });

  it('guards against a concurrent double-approval (updateMany count 0)', async () => {
    (prisma.affiliateCommission.findUnique as any).mockResolvedValue({ id: 'c1', affiliateId: 'aff1', status: 'pending', amount: 20 });
    (prisma.affiliateCommission.updateMany as any).mockResolvedValue({ count: 0 });
    await expect(approveCommission('c1')).rejects.toThrow(/already resolved/i);
    expect(prisma.affiliate.update).not.toHaveBeenCalled();
  });

  it('approves inside one transaction (status flip + increment cannot diverge)', async () => {
    (prisma.affiliateCommission.findUnique as any)
      .mockResolvedValueOnce({ id: 'c1', affiliateId: 'aff1', status: 'pending', amount: 20 })
      .mockResolvedValueOnce({ id: 'c1', status: 'approved' });
    (prisma.affiliateCommission.updateMany as any).mockResolvedValue({ count: 1 });
    (prisma.affiliate.update as any).mockResolvedValue({});

    await approveCommission('c1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const txCallback = (prisma.$transaction as any).mock.calls[0][0];
    await expect(txCallback(prisma)).resolves.toBeUndefined();
    expect(prisma.affiliateCommission.updateMany).toHaveBeenCalled();
    expect(prisma.affiliate.update).toHaveBeenCalledWith({
      where: { id: 'aff1' },
      data: { totalEarned: { increment: 20 } },
    });
  });
});

describe('voidCommission (refund clawback)', () => {
  it('voids a PENDING commission without touching totalEarned', async () => {
    (prisma.affiliateCommission.findUnique as any)
      .mockResolvedValueOnce({ id: 'c1', affiliateId: 'aff1', status: 'pending', amount: 20 })
      .mockResolvedValueOnce({ id: 'c1', status: 'voided' });
    (prisma.affiliateCommission.updateMany as any).mockResolvedValue({ count: 1 });

    const result = await voidCommission('c1');

    expect(prisma.affiliateCommission.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', status: 'pending' },
      data: { status: 'voided' },
    });
    expect(prisma.affiliate.update).not.toHaveBeenCalled();
    expect(result?.status).toBe('voided');
  });

  it('voids an APPROVED commission and claws back totalEarned', async () => {
    (prisma.affiliateCommission.findUnique as any)
      .mockResolvedValueOnce({ id: 'c1', affiliateId: 'aff1', status: 'approved', amount: 20 })
      .mockResolvedValueOnce({ id: 'c1', status: 'voided' });
    (prisma.affiliateCommission.updateMany as any).mockResolvedValue({ count: 1 });
    (prisma.affiliate.updateMany as any).mockResolvedValue({ count: 1 }); // gte guard passes

    await voidCommission('c1');

    expect(prisma.affiliateCommission.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', status: 'approved' },
      data: { status: 'voided' },
    });
    expect(prisma.affiliate.updateMany).toHaveBeenCalledWith({
      where: { id: 'aff1', totalEarned: { gte: 20 } },
      data: { totalEarned: { decrement: 20 } },
    });
    expect(prisma.affiliate.update).not.toHaveBeenCalled(); // no zero-fallback
  });

  it('floors totalEarned at 0 when the balance is somehow below the amount', async () => {
    (prisma.affiliateCommission.findUnique as any)
      .mockResolvedValueOnce({ id: 'c1', affiliateId: 'aff1', status: 'approved', amount: 20 })
      .mockResolvedValueOnce({ id: 'c1', status: 'voided' });
    (prisma.affiliateCommission.updateMany as any).mockResolvedValue({ count: 1 });
    (prisma.affiliate.updateMany as any).mockResolvedValue({ count: 0 }); // gte guard fails
    (prisma.affiliate.update as any).mockResolvedValue({});

    await voidCommission('c1');

    expect(prisma.affiliate.update).toHaveBeenCalledWith({
      where: { id: 'aff1' },
      data: { totalEarned: 0 },
    });
  });

  it('refuses to void a terminal (rejected/voided) commission', async () => {
    (prisma.affiliateCommission.findUnique as any).mockResolvedValue({ id: 'c1', status: 'rejected' });
    await expect(voidCommission('c1')).rejects.toThrow(/already rejected/i);
    expect(prisma.affiliateCommission.updateMany).not.toHaveBeenCalled();
  });

  it('refuses when the commission row is gone', async () => {
    (prisma.affiliateCommission.findUnique as any).mockResolvedValue(null);
    await expect(voidCommission('c1')).rejects.toThrow(/not found/i);
  });
});

describe('voidCommissionForOrder', () => {
  it('voids the commission of a fully refunded order', async () => {
    (prisma.affiliateCommission.findUnique as any)
      .mockResolvedValueOnce({ id: 'c1', affiliateId: 'aff1', status: 'approved', amount: 20 })
      .mockResolvedValueOnce({ id: 'c1', status: 'approved', affiliateId: 'aff1', amount: 20 })
      .mockResolvedValueOnce({ id: 'c1', status: 'voided', affiliateId: 'aff1', amount: 20 });
    (prisma.affiliateCommission.updateMany as any).mockResolvedValue({ count: 1 });
    (prisma.affiliate.updateMany as any).mockResolvedValue({ count: 1 });

    const result = await voidCommissionForOrder('o1');

    expect(result?.status).toBe('voided');
    expect(prisma.affiliateCommission.findUnique).toHaveBeenCalledWith({ where: { orderId: 'o1' } });
  });

  it('is a no-op when the order has no commission', async () => {
    (prisma.affiliateCommission.findUnique as any).mockResolvedValue(null);
    expect(await voidCommissionForOrder('o1')).toBeNull();
  });

  it('NEVER throws — a ledger hiccup cannot fail a refund', async () => {
    (prisma.affiliateCommission.findUnique as any).mockRejectedValue(new Error('db down'));
    await expect(voidCommissionForOrder('o1')).resolves.toBeNull();
  });
});

describe('approvePayout / rejectPayout', () => {
  it('pays a pending payout and increments totalPaid', async () => {
    (prisma.affiliatePayout.findUnique as any).mockResolvedValue({ id: 'p1', affiliateId: 'aff1', status: 'pending', amount: 30 });
    (prisma.affiliate.findUnique as any).mockResolvedValue(affiliateRow({ totalPaid: 0 }));
    (prisma.affiliateCommission.findMany as any).mockResolvedValue([
      { amount: 20, status: 'approved' },
      { amount: 10, status: 'approved' },
      { amount: 5, status: 'pending' }, // pending must not count
    ]);
    (prisma.affiliatePayout.updateMany as any).mockResolvedValue({ count: 1 });
    (prisma.affiliate.update as any).mockResolvedValue({});

    await approvePayout('p1');

    expect(prisma.affiliatePayout.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', status: 'pending' },
      data: expect.objectContaining({ status: 'paid' }),
    });
    expect(prisma.affiliate.update).toHaveBeenCalledWith({
      where: { id: 'aff1' },
      data: { totalPaid: { increment: 30 } },
    });
  });

  it('refuses when the available balance no longer covers the payout', async () => {
    (prisma.affiliatePayout.findUnique as any).mockResolvedValue({ id: 'p1', affiliateId: 'aff1', status: 'pending', amount: 40 });
    (prisma.affiliate.findUnique as any).mockResolvedValue(affiliateRow({ totalPaid: 0 }));
    (prisma.affiliateCommission.findMany as any).mockResolvedValue([{ amount: 30, status: 'approved' }]);

    await expect(approvePayout('p1')).rejects.toThrow(/no longer covers/i);
    expect(prisma.affiliatePayout.updateMany).not.toHaveBeenCalled();
    expect(prisma.affiliate.update).not.toHaveBeenCalled();
  });

  it('rejects a payout without touching totalPaid', async () => {
    (prisma.affiliatePayout.findUnique as any).mockResolvedValue({ id: 'p1', affiliateId: 'aff1', status: 'pending', amount: 10 });
    (prisma.affiliatePayout.updateMany as any).mockResolvedValue({ count: 1 });
    await rejectPayout('p1');
    expect(prisma.affiliate.update).not.toHaveBeenCalled();
  });
});

describe('setAffiliateStatus / setAffiliateRate', () => {
  it('moves pending -> active (approval)', async () => {
    (prisma.affiliate.findUnique as any).mockResolvedValue(affiliateRow({ status: 'pending' }));
    (prisma.affiliate.updateMany as any).mockResolvedValue({ count: 1 });
    (prisma.affiliate.findUnique as any).mockResolvedValueOnce(affiliateRow({ status: 'pending' })).mockResolvedValueOnce(affiliateRow({ status: 'active' }));

    const result = await setAffiliateStatus('aff1', 'active');
    expect(result?.status).toBe('active');
    expect(prisma.affiliate.updateMany).toHaveBeenCalledWith({
      where: { id: 'aff1', status: { not: 'active' } },
      data: { status: 'active' },
    });
  });

  it('rejects a rate above 100%', async () => {
    (prisma.affiliate.findUnique as any).mockResolvedValue(affiliateRow());
    await expect(setAffiliateRate('aff1', 150)).rejects.toThrow(/between 0 and 100/i);
  });

  it('accepts null to fall back to the store default', async () => {
    (prisma.affiliate.findUnique as any).mockResolvedValue(affiliateRow());
    (prisma.affiliate.update as any).mockResolvedValue({});
    await setAffiliateRate('aff1', null);
    expect(prisma.affiliate.update).toHaveBeenCalledWith({
      where: { id: 'aff1' },
      data: { rateOverride: null },
    });
  });
});

describe('trackClick', () => {
  it('records a click and bumps the counter for an active affiliate', async () => {
    (prisma.affiliate.findUnique as any).mockResolvedValue(affiliateRow());
    (prisma.affiliateClick.create as any).mockResolvedValue({ id: 'k1' });
    (prisma.affiliate.update as any).mockResolvedValue({});

    const result = await trackClick('MARTIN-1', '203.0.113.7');

    expect(result?.id).toBe('aff1');
    expect(prisma.affiliateClick.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        affiliateId: 'aff1',
        ipHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    });
    expect(prisma.affiliate.update).toHaveBeenCalledWith({
      where: { id: 'aff1' },
      data: { clicks: { increment: 1 } },
    });
  });

  it('ignores clicks for unknown or non-active codes', async () => {
    (prisma.affiliate.findUnique as any).mockResolvedValue(null);
    expect(await trackClick('NOPE-1234')).toBeNull();
    (prisma.affiliate.findUnique as any).mockResolvedValue(affiliateRow({ status: 'pending' }));
    expect(await trackClick('MARTIN-1')).toBeNull();
    expect(prisma.affiliateClick.create).not.toHaveBeenCalled();
  });
});
