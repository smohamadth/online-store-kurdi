// ---------------------------------------------------------------------------
// Affiliate program core logic.
//
// The program is opt-in (StoreSettings.affiliateEnabled, default off).
// Lifecycle:
//   apply (status pending) -> admin approve (active) -> earns commissions
//   commission: created when a referred order is PAID (pending)
//               -> admin approve (approved, totalEarned += amount)
//               | admin reject (terminal)
//   payout:     affiliate requests (pending, amount <= available balance)
//               -> admin approve (paid, totalPaid += amount)
//               | admin reject (terminal)
//   available balance = approved commissions - totalPaid
//
// All money movements use conditional updateMany / increment (same
// atomicity pattern as the wallet module) so concurrent requests cannot
// double-count.
// ---------------------------------------------------------------------------
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { AppError } from '../../middleware/errorHandler';
import {
  generateAffiliateCode,
  commissionAmount,
  availableBalance,
  roundMoney,
  hashIp,
} from './affiliate.helpers';

/** Store default rate when settings are missing (mirrors schema default). */
export const DEFAULT_AFFILIATE_RATE = 10;

export const AFFILIATE_STATUSES = ['pending', 'active', 'suspended'] as const;
export const COMMISSION_STATUSES = ['pending', 'approved', 'rejected'] as const;
export const PAYOUT_STATUSES = ['pending', 'paid', 'rejected'] as const;

async function getStoreSettings() {
  return prisma.storeSettings.findUnique({ where: { id: 'default' } });
}

/** True when the affiliate program is switched on for this store. */
export async function isAffiliateProgramEnabled(): Promise<boolean> {
  const settings = await getStoreSettings();
  return settings?.affiliateEnabled === true;
}

/** The store's default commission rate (schema default when unset). */
export async function getDefaultRate(): Promise<number> {
  const settings = await getStoreSettings();
  return typeof settings?.affiliateRate === 'number' ? settings.affiliateRate : DEFAULT_AFFILIATE_RATE;
}

// ====================================================================
// Applications
// ====================================================================

/**
 * Join the program. Generates a unique referral code, status `pending`.
 * Throws AppError when the program is disabled or the user already applied.
 */
export async function applyAsAffiliate(userId: string, firstName?: string | null, lastName?: string | null) {
  if (!(await isAffiliateProgramEnabled())) {
    throw new AppError('The affiliate program is not enabled for this store.', 400);
  }
  const existing = await prisma.affiliate.findUnique({ where: { userId } });
  if (existing) {
    throw new AppError('You have already applied to the affiliate program.', 400);
  }
  // Code must be unique; collisions are vanishingly rare, but retry rather
  // than 500 on the one-in-a-billion name collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateAffiliateCode(firstName, lastName);
    try {
      return await prisma.affiliate.create({
        data: { userId, code, status: 'pending' },
      });
    } catch (err: any) {
      // P2002 = unique constraint violation on code (or userId, already
      // checked above — the create raced another apply).
      if (err?.code === 'P2002') {
        if (attempt === 4) throw new AppError('Could not generate a unique referral code. Please try again.', 409);
        continue;
      }
      throw err;
    }
  }
  throw new AppError('Could not create affiliate profile. Please try again.', 500);
}

// ====================================================================
// Commission creation (called when an order flips to PAID)
// ====================================================================

/**
 * Create the pending commission for a paid order, if the order was
 * attributed to an affiliate. Idempotent on orderId (webhook replays must
 * never double-pay), best-effort and NEVER throws — commission hiccups must
 * not fail payment settlement (same contract as autoPostOrder).
 *
 * Rules:
 *  - no affiliateId on the order (or order not paid) => no-op
 *  - affiliate not `active` at payment time => no-op (a suspended affiliate
 *    does not earn on payments that land while suspended)
 *  - rate = affiliate.rateOverride ?? store affiliateRate
 *  - amount = round(order.totalAmount * rate / 100); 0 => no-op
 *  - program disabled does NOT block creation: orders placed while the
 *    program was on still earn even if the store turns it off afterwards.
 */
export async function createCommissionForOrder(orderId: string) {
  try {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order?.affiliateId) return null;
    if (order.paymentStatus !== 'completed') return null;

    const affiliate = await prisma.affiliate.findUnique({ where: { id: order.affiliateId } });
    if (!affiliate || affiliate.status !== 'active') return null;

    // Self-referral exclusion: an affiliate must not earn commission on
    // their OWN purchases through their own link (farming). The buyer is
    // the order's owner; if it is the affiliate's account, no commission.
    if (order.userId === affiliate.userId) return null;

    const settings = await getStoreSettings();
    const rate =
      typeof affiliate.rateOverride === 'number'
        ? affiliate.rateOverride
        : typeof settings?.affiliateRate === 'number'
          ? settings.affiliateRate
          : DEFAULT_AFFILIATE_RATE;
    const amount = commissionAmount(order.totalAmount, rate);
    if (amount <= 0) return null;

    const existing = await prisma.affiliateCommission.findUnique({ where: { orderId } });
    if (existing) return existing;

    return await prisma.affiliateCommission.create({
      data: {
        affiliateId: affiliate.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderAmount: order.totalAmount,
        rate,
        amount,
        status: 'pending',
        currency: settings?.currency || 'USD',
      },
    });
  } catch (err) {
    logger.warn('⚠️ Affiliate: could not create commission (best-effort, order stays paid):', err as Error);
    return null;
  }
}

// ====================================================================
// Dashboard stats
// ====================================================================

/** Aggregate stats for the affiliate's own dashboard. */
export async function getAffiliateStats(affiliateId: string) {
  const [commissions, clicks, payouts] = await Promise.all([
    prisma.affiliateCommission.findMany({ where: { affiliateId } }),
    prisma.affiliateClick.count({ where: { affiliateId } }),
    prisma.affiliatePayout.findMany({ where: { affiliateId } }),
  ]);
  // Explicit row types: prisma delegates are `any` until the client is
  // generated (sandbox), so the callbacks below would otherwise trip
  // noImplicitAny.
  const rows = commissions as { status: string; amount: number }[];
  const payoutRows = payouts as { status: string; amount: number }[];
  const approvedTotal = rows
    .filter((c) => c.status === 'approved')
    .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  const pendingTotal = rows
    .filter((c) => c.status === 'pending')
    .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  const paidTotal = payoutRows
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  return {
    clicks,
    referredOrders: commissions.length,
    pendingCommissions: rows.filter((c) => c.status === 'pending').length,
    pendingEarnings: roundMoney(pendingTotal),
    approvedEarnings: roundMoney(approvedTotal),
    paidOut: roundMoney(paidTotal),
    available: availableBalance(approvedTotal, paidTotal),
  };
}

// ====================================================================
// Admin actions (money movements are conditional-atomic)
// ====================================================================

/**
 * Approve a pending commission: pending -> approved, totalEarned += amount.
 * The status flip and the balance increment happen in ONE transaction so a
 * crash between them can never leave an approved commission that is not
 * counted (or a counted commission that is not approved).
 */
export async function approveCommission(commissionId: string) {
  const commission = await prisma.affiliateCommission.findUnique({ where: { id: commissionId } });
  if (!commission) throw new AppError('Commission not found', 404);
  if (commission.status !== 'pending') {
    throw new AppError(`Commission is already ${commission.status}.`, 400);
  }
  await prisma.$transaction(async (tx: any) => {
    const result = await tx.affiliateCommission.updateMany({
      where: { id: commissionId, status: 'pending' },
      data: { status: 'approved', approvedAt: new Date() },
    });
    if (result.count === 0) throw new AppError('Commission was already resolved.', 409);
    // totalEarned is the sum of approved commissions; increment atomically.
    await tx.affiliate.update({
      where: { id: commission.affiliateId },
      data: { totalEarned: { increment: commission.amount } },
    });
  });
  return prisma.affiliateCommission.findUnique({ where: { id: commissionId } });
}

/** Reject a pending commission: pending -> rejected (terminal). */
export async function rejectCommission(commissionId: string) {
  const commission = await prisma.affiliateCommission.findUnique({ where: { id: commissionId } });
  if (!commission) throw new AppError('Commission not found', 404);
  if (commission.status !== 'pending') {
    throw new AppError(`Commission is already ${commission.status}.`, 400);
  }
  const result = await prisma.affiliateCommission.updateMany({
    where: { id: commissionId, status: 'pending' },
    data: { status: 'rejected' },
  });
  if (result.count === 0) throw new AppError('Commission was already resolved.', 409);
  return prisma.affiliateCommission.findUnique({ where: { id: commissionId } });
}

/**
 * Void a commission — the refund clawback. Works from `pending` OR
 * `approved` (rejected/voided are terminal):
 *   - approved -> voided AND totalEarned is decremented by the amount
 *     (conditional, floor at 0), so the affiliate's balance shrinks to
 *     match the money the store gave back to the customer;
 *   - pending  -> voided (it never entered totalEarned, nothing to undo).
 *
 * Called automatically when a referred order is FULLY refunded, and
 * available to admins manually (partial refunds, fraud).
 */
export async function voidCommission(commissionId: string) {
  const commission = await prisma.affiliateCommission.findUnique({ where: { id: commissionId } });
  if (!commission) throw new AppError('Commission not found', 404);
  if (commission.status !== 'pending' && commission.status !== 'approved') {
    throw new AppError(`Commission is already ${commission.status}.`, 400);
  }
  const wasApproved = commission.status === 'approved';
  await prisma.$transaction(async (tx: any) => {
    const result = await tx.affiliateCommission.updateMany({
      where: { id: commissionId, status: wasApproved ? 'approved' : 'pending' },
      data: { status: 'voided' },
    });
    if (result.count === 0) throw new AppError('Commission was already resolved.', 409);
    if (wasApproved) {
      // Claw back the counted earnings. Conditional decrement (gte amount)
      // so a concurrent payout-paid state can never drive totalEarned
      // negative; if the balance is somehow below the amount, zero it.
      const clawed = await tx.affiliate.updateMany({
        where: { id: commission.affiliateId, totalEarned: { gte: commission.amount } },
        data: { totalEarned: { decrement: commission.amount } },
      });
      if (clawed.count === 0) {
        await tx.affiliate.update({
          where: { id: commission.affiliateId },
          data: { totalEarned: 0 },
        });
      }
    }
  });
  return prisma.affiliateCommission.findUnique({ where: { id: commissionId } });
}

/**
 * Refund clawback for an order: void its commission when the order is fully
 * refunded. Best-effort and NEVER throws (refunds must not fail because of
 * the affiliate ledger), no-op when there is no commission.
 */
export async function voidCommissionForOrder(orderId: string) {
  try {
    const commission = await prisma.affiliateCommission.findUnique({ where: { orderId } });
    if (!commission) return null;
    if (commission.status !== 'pending' && commission.status !== 'approved') return commission;
    return await voidCommission(commission.id);
  } catch (err) {
    logger.warn('⚠️ Affiliate: could not void commission on refund (best-effort):', err as Error);
    return null;
  }
}

/**
 * Approve a payout request: pending -> paid, totalPaid += amount.
 * Guarded: the affiliate's available balance must still cover the payout
 * (a commission approved after the request could have been voided in the
 * meantime, shrinking the balance). All reads + the status flip + the
 * totalPaid increment happen in ONE transaction.
 */
export async function approvePayout(payoutId: string, adminNotes?: string | null) {
  const payout = await prisma.affiliatePayout.findUnique({ where: { id: payoutId } });
  if (!payout) throw new AppError('Payout not found', 404);
  if (payout.status !== 'pending') {
    throw new AppError(`Payout is already ${payout.status}.`, 400);
  }
  await prisma.$transaction(async (tx: any) => {
    const affiliate = await tx.affiliate.findUnique({ where: { id: payout.affiliateId } });
    if (!affiliate) throw new AppError('Affiliate not found', 404);

    const commissions = await tx.affiliateCommission.findMany({
      where: { affiliateId: payout.affiliateId, status: 'approved' },
    });
    const approvedTotal = (commissions as { amount: number }[]).reduce(
      (sum, c) => sum + (Number(c.amount) || 0),
      0,
    );
    const available = availableBalance(approvedTotal, affiliate.totalPaid);
    if (payout.amount > available + 0.005) {
      throw new AppError(
        `The affiliate's available balance (${available.toFixed(2)}) no longer covers this payout (${Number(payout.amount).toFixed(2)}). Reject it instead.`,
        409,
      );
    }

    const result = await tx.affiliatePayout.updateMany({
      where: { id: payoutId, status: 'pending' },
      data: { status: 'paid', resolvedAt: new Date(), adminNotes: adminNotes ?? null },
    });
    if (result.count === 0) throw new AppError('Payout was already resolved.', 409);

    await tx.affiliate.update({
      where: { id: payout.affiliateId },
      data: { totalPaid: { increment: payout.amount } },
    });
  });
  return prisma.affiliatePayout.findUnique({ where: { id: payoutId } });
}

/** Reject a payout request: pending -> rejected (terminal). */
export async function rejectPayout(payoutId: string, adminNotes?: string | null) {
  const payout = await prisma.affiliatePayout.findUnique({ where: { id: payoutId } });
  if (!payout) throw new AppError('Payout not found', 404);
  if (payout.status !== 'pending') {
    throw new AppError(`Payout is already ${payout.status}.`, 400);
  }
  const result = await prisma.affiliatePayout.updateMany({
    where: { id: payoutId, status: 'pending' },
    data: { status: 'rejected', resolvedAt: new Date(), adminNotes: adminNotes ?? null },
  });
  if (result.count === 0) throw new AppError('Payout was already resolved.', 409);
  return prisma.affiliatePayout.findUnique({ where: { id: payoutId } });
}

// ====================================================================
// Affiliate status transitions (admin)
// ====================================================================

/** pending|suspended -> active. Approval is what lets the affiliate earn. */
export async function setAffiliateStatus(affiliateId: string, status: 'active' | 'suspended') {
  const affiliate = await prisma.affiliate.findUnique({ where: { id: affiliateId } });
  if (!affiliate) throw new AppError('Affiliate not found', 404);
  if (status === affiliate.status) return affiliate;
  const result = await prisma.affiliate.updateMany({
    where: { id: affiliateId, status: { not: status } },
    data: { status },
  });
  if (result.count === 0) throw new AppError('Affiliate status did not change.', 409);
  return prisma.affiliate.findUnique({ where: { id: affiliateId } });
}

/**
 * Set a per-affiliate rate override. `rateOverride` null = follow the store
 * default. Clamped 0..100 (a rate above 100% would pay the affiliate more
 * than the order is worth).
 */
export async function setAffiliateRate(affiliateId: string, rateOverride: number | null) {
  const affiliate = await prisma.affiliate.findUnique({ where: { id: affiliateId } });
  if (!affiliate) throw new AppError('Affiliate not found', 404);
  if (rateOverride !== null) {
    if (!Number.isFinite(rateOverride) || rateOverride < 0 || rateOverride > 100) {
      throw new AppError('Rate must be between 0 and 100.', 400);
    }
    rateOverride = roundMoney(rateOverride);
  }
  return prisma.affiliate.update({
    where: { id: affiliateId },
    data: { rateOverride },
  });
}

// ====================================================================
// Click tracking
// ====================================================================

/**
 * Record a click on an affiliate link and (optionally) issue the
 * attribution cookie. Returns the affiliate when the click counts.
 * Throttling is the caller's job (viewBumpAllowed).
 */
export async function trackClick(code: string, ip?: string) {
  const affiliate = await prisma.affiliate.findUnique({ where: { code } });
  if (!affiliate || affiliate.status !== 'active') return null;
  await prisma.affiliateClick.create({
    data: { affiliateId: affiliate.id, ipHash: hashIp(ip) },
  });
  await prisma.affiliate.update({
    where: { id: affiliate.id },
    data: { clicks: { increment: 1 } },
  });
  return affiliate;
}
