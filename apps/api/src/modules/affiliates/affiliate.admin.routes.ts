// ---------------------------------------------------------------------------
// Affiliate marketing — admin routes (admin role only).
//
//   GET  /api/affiliates                    list profiles (+ filters)
//   POST /api/affiliates/:id/approve        pending/suspended -> active
//   POST /api/affiliates/:id/suspend        active -> suspended
//   PUT  /api/affiliates/:id/rate           set per-affiliate rate override
//   GET  /api/affiliates/commissions        list commissions (+ status filter)
//   POST /api/affiliates/commissions/:id/approve   pending -> approved
//   POST /api/affiliates/commissions/:id/reject    pending -> rejected
//   POST /api/affiliates/commissions/:id/void      pending|approved -> voided
//                                                  (approved also claws back
//                                                  totalEarned)
//   GET  /api/affiliates/payouts            list payout requests (+ filter)
//   POST /api/affiliates/payouts/:id/approve      pending -> paid
//   POST /api/affiliates/payouts/:id/reject       pending -> rejected
//   POST /api/affiliates/payouts/:id/reverse      paid -> reversed (money
//                                                 recovered off-platform;
//                                                 totalPaid clawed back)
// ---------------------------------------------------------------------------
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { parsePagination } from '../../utils/pagination';
import {
  approveCommission,
  approvePayout,
  rejectCommission,
  rejectPayout,
  reversePayout,
  setAffiliateRate,
  setAffiliateStatus,
  voidCommission,
} from './affiliate.service';

const router = Router();

// All admin affiliate routes require the admin role (money-related).
router.use(authenticate, authorize('admin'));

// GET /api/affiliates — list with the owning user's identity + stats.
// Bounded by parsePagination (limit is clamped; a hostile ?limit=999999999
// cannot force a full-table scan).
router.get('/', async (req, res, next) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const { skip, limit } = parsePagination(req.query as Record<string, unknown>, { maxLimit: 500 });
    const affiliates = await prisma.affiliate.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });
    res.json({ status: 'success', data: affiliates });
  } catch (err) { next(err); }
});

// POST /api/affiliates/:id/approve — approve the application.
router.post('/:id/approve', async (req, res, next) => {
  try {
    const affiliate = await setAffiliateStatus(req.params.id, 'active');
    res.json({ status: 'success', data: affiliate });
  } catch (err) { next(err); }
});

// POST /api/affiliates/:id/suspend — suspend an active affiliate.
router.post('/:id/suspend', async (req, res, next) => {
  try {
    const affiliate = await setAffiliateStatus(req.params.id, 'suspended');
    res.json({ status: 'success', data: affiliate });
  } catch (err) { next(err); }
});

const rateSchema = z.object({
  rateOverride: z.number().min(0).max(100).optional().nullable(),
});

// PUT /api/affiliates/:id/rate — per-affiliate commission % (null = store default).
router.put('/:id/rate', async (req, res, next) => {
  try {
    const { rateOverride } = rateSchema.parse(req.body ?? {});
    const affiliate = await setAffiliateRate(req.params.id, rateOverride ?? null);
    res.json({ status: 'success', data: affiliate });
  } catch (err) { next(err); }
});

// GET /api/affiliates/commissions — full commission ledger with affiliate
// identity + order number. `status` filter: pending|approved|rejected|voided.
router.get('/commissions', async (req, res, next) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const { skip, limit } = parsePagination(req.query as Record<string, unknown>, { maxLimit: 500 });
    const commissions = await prisma.affiliateCommission.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        affiliate: {
          include: { user: { select: { email: true, firstName: true, lastName: true } } },
        },
      },
    });
    res.json({ status: 'success', data: commissions });
  } catch (err) { next(err); }
});

// POST /api/affiliates/commissions/:id/approve
router.post('/commissions/:id/approve', async (req, res, next) => {
  try {
    const commission = await approveCommission(req.params.id);
    res.json({ status: 'success', data: commission });
  } catch (err) { next(err); }
});

// POST /api/affiliates/commissions/:id/reject
router.post('/commissions/:id/reject', async (req, res, next) => {
  try {
    const commission = await rejectCommission(req.params.id);
    res.json({ status: 'success', data: commission });
  } catch (err) { next(err); }
});

// POST /api/affiliates/commissions/:id/void — refund clawback / manual
// reversal. Works from pending OR approved; approved also decrements the
// affiliate's totalEarned (atomically, floor at 0).
router.post('/commissions/:id/void', async (req, res, next) => {
  try {
    const commission = await voidCommission(req.params.id);
    res.json({ status: 'success', data: commission });
  } catch (err) { next(err); }
});

// GET /api/affiliates/payouts — payout requests with affiliate identity.
router.get('/payouts', async (req, res, next) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const { skip, limit } = parsePagination(req.query as Record<string, unknown>, { maxLimit: 500 });
    const payouts = await prisma.affiliatePayout.findMany({
      where: status ? { status } : undefined,
      orderBy: { requestedAt: 'desc' },
      skip,
      take: limit,
      include: {
        affiliate: {
          include: { user: { select: { email: true, firstName: true, lastName: true } } },
        },
      },
    });
    res.json({ status: 'success', data: payouts });
  } catch (err) { next(err); }
});

const payoutResolutionSchema = z.object({
  adminNotes: z.string().max(500).optional().nullable(),
});

// POST /api/affiliates/payouts/:id/approve — mark the transfer as done.
router.post('/payouts/:id/approve', async (req, res, next) => {
  try {
    const body = payoutResolutionSchema.parse(req.body ?? {});
    const payout = await approvePayout(req.params.id, body.adminNotes ?? null);
    res.json({ status: 'success', data: payout });
  } catch (err) { next(err); }
});

// POST /api/affiliates/payouts/:id/reject
router.post('/payouts/:id/reject', async (req, res, next) => {
  try {
    const body = payoutResolutionSchema.parse(req.body ?? {});
    const payout = await rejectPayout(req.params.id, body.adminNotes ?? null);
    res.json({ status: 'success', data: payout });
  } catch (err) { next(err); }
});

// POST /api/affiliates/payouts/:id/reverse — record that money came back
// off-platform (returned wire, recovered after a refund clawback, …).
// paid -> reversed; totalPaid is clawed back atomically (floor at 0).
router.post('/payouts/:id/reverse', async (req, res, next) => {
  try {
    const body = payoutResolutionSchema.parse(req.body ?? {});
    const payout = await reversePayout(req.params.id, body.adminNotes ?? null);
    res.json({ status: 'success', data: payout });
  } catch (err) { next(err); }
});

export default router;
