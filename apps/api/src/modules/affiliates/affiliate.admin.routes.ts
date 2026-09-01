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
//   GET  /api/affiliates/payouts            list payout requests (+ filter)
//   POST /api/affiliates/payouts/:id/approve      pending -> paid
//   POST /api/affiliates/payouts/:id/reject       pending -> rejected
// ---------------------------------------------------------------------------
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import {
  approveCommission,
  approvePayout,
  rejectCommission,
  rejectPayout,
  setAffiliateRate,
  setAffiliateStatus,
} from './affiliate.service';

const router = Router();

// All admin affiliate routes require the admin role (money-related).
router.use(authenticate, authorize('admin'));

// GET /api/affiliates — list with the owning user's identity + stats.
router.get('/', async (req, res, next) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const affiliates = await prisma.affiliate.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
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
// identity + order number. `status` filter: pending|approved|rejected.
router.get('/commissions', async (req, res, next) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const commissions = await prisma.affiliateCommission.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
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

// GET /api/affiliates/payouts — payout requests with affiliate identity.
router.get('/payouts', async (req, res, next) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const payouts = await prisma.affiliatePayout.findMany({
      where: status ? { status } : undefined,
      orderBy: { requestedAt: 'desc' },
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

export default router;
