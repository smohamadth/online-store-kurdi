// ---------------------------------------------------------------------------
// Affiliate marketing — public + affiliate-facing routes.
//
//   POST /api/affiliates/track          (public: record a referral click +
//                                        issue the aff_ref attribution cookie)
//   POST /api/affiliates/apply          (auth: join the program)
//   GET  /api/affiliates/me             (auth: own profile + stats)
//   GET  /api/affiliates/me/commissions (auth: own commission ledger)
//   GET  /api/affiliates/me/clicks      (auth: recent click history)
//   GET  /api/affiliates/me/payouts     (auth: own payout requests)
//   POST /api/affiliates/me/payouts     (auth: request a payout)
//
// Admin management lives in affiliate.admin.routes.ts.
// ---------------------------------------------------------------------------
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { AppError } from '../../middleware/errorHandler';
import { prisma } from '../../config/database';
import { isDevelopment } from '../../config/environment';
import { viewBumpAllowed } from '../../utils/viewThrottle';
import { parsePagination } from '../../utils/pagination';
import {
  applyAsAffiliate,
  getAffiliateStats,
  isAffiliateProgramEnabled,
  trackClick,
} from './affiliate.service';
import { AFFILIATE_COOKIE, AFFILIATE_COOKIE_DAYS, isValidAffiliateCode } from './affiliate.helpers';

const router = Router();

const trackSchema = z.object({
  code: z.string().min(1).max(24),
});

// POST /api/affiliates/track — public, no auth.
//
// Called by the storefront when a visitor lands on a ?ref=CODE link. When
// the program is on and the code belongs to an active affiliate: records a
// click (throttled per code+IP so bots can't inflate the counter) and sets
// the 30-day `aff_ref` attribution cookie. Anything else answers
// { valid: false } WITHOUT a cookie — a stale or fake ref must never break
// a page load, so this endpoint never errors on the ref itself.
// authz-ok: public storefront tracking pixel; records a click by ref code and returns no PII
router.post('/track', async (req, res, next) => {
  try {
    const { code } = trackSchema.parse(req.body ?? {});
    const normalised = code.trim().toUpperCase();

    if (!(await isAffiliateProgramEnabled()) || !isValidAffiliateCode(normalised)) {
      res.json({ status: 'success', data: { valid: false, code: normalised } });
      return;
    }

    const ip = req.ip || req.socket?.remoteAddress;
    const throttleKey = `aff-track:${normalised}:${ip ?? 'anon'}`;
    const mayCount = viewBumpAllowed(throttleKey, 60_000);

    const affiliate = mayCount ? await trackClick(normalised, ip) : await resolveActiveAffiliate(normalised);

    if (!affiliate) {
      res.json({ status: 'success', data: { valid: false, code: normalised } });
      return;
    }

    res.cookie(AFFILIATE_COOKIE, affiliate.code, {
      maxAge: AFFILIATE_COOKIE_DAYS * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      // HTTPS-only in production; dev runs over plain http.
      secure: !isDevelopment,
    });
    res.json({ status: 'success', data: { valid: true, code: affiliate.code } });
  } catch (err) {
    next(err);
  }
});

async function resolveActiveAffiliate(code: string) {
  const affiliate = await prisma.affiliate.findUnique({ where: { code } });
  return affiliate && affiliate.status === 'active' ? affiliate : null;
}

const applySchema = z.object({
  // Optional display-name overrides for the code ("MARTIN-7K2F"). Falls
  // back to the account's own first/last name, then a generic prefix.
  firstName: z.string().max(40).optional().nullable(),
  lastName: z.string().max(40).optional().nullable(),
});

// POST /api/affiliates/apply — any authenticated customer can apply.
router.post('/apply', authenticate, async (req, res, next) => {
  try {
    const body = applySchema.parse(req.body ?? {});
    const affiliate = await applyAsAffiliate(
      req.user!.id,
      body.firstName ?? req.user!.firstName,
      body.lastName ?? req.user!.lastName,
    );
    res.status(201).json({ status: 'success', data: affiliate });
  } catch (err) {
    next(err);
  }
});

// GET /api/affiliates/me — own profile + stats. 200 even with no profile:
// the storefront renders the "apply" state from `affiliate: null`.
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const [programEnabled, affiliate] = await Promise.all([
      isAffiliateProgramEnabled(),
      prisma.affiliate.findUnique({ where: { userId: req.user!.id } }),
    ]);
    if (!affiliate) {
      res.json({ status: 'success', data: { programEnabled, affiliate: null } });
      return;
    }
    const stats = await getAffiliateStats(affiliate.id);
    res.json({ status: 'success', data: { programEnabled, affiliate, stats } });
  } catch (err) {
    next(err);
  }
});

// GET /api/affiliates/me/commissions — own commission ledger, newest first.
router.get('/me/commissions', authenticate, async (req, res, next) => {
  try {
    const affiliate = await prisma.affiliate.findUnique({ where: { userId: req.user!.id } });
    if (!affiliate) throw new AppError('You have not joined the affiliate program.', 404);
    const { skip, limit } = parsePagination(req.query as Record<string, unknown>);
    const commissions = await prisma.affiliateCommission.findMany({
      where: { affiliateId: affiliate.id },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });
    res.json({ status: 'success', data: commissions });
  } catch (err) {
    next(err);
  }
});

// GET /api/affiliates/me/clicks — own recent clicks (metric only).
router.get('/me/clicks', authenticate, async (req, res, next) => {
  try {
    const affiliate = await prisma.affiliate.findUnique({ where: { userId: req.user!.id } });
    if (!affiliate) throw new AppError('You have not joined the affiliate program.', 404);
    const clicks = await prisma.affiliateClick.findMany({
      where: { affiliateId: affiliate.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ status: 'success', data: clicks });
  } catch (err) {
    next(err);
  }
});

// GET /api/affiliates/me/payouts — own payout requests, newest first.
router.get('/me/payouts', authenticate, async (req, res, next) => {
  try {
    const affiliate = await prisma.affiliate.findUnique({ where: { userId: req.user!.id } });
    if (!affiliate) throw new AppError('You have not joined the affiliate program.', 404);
    const { skip, limit } = parsePagination(req.query as Record<string, unknown>);
    const payouts = await prisma.affiliatePayout.findMany({
      where: { affiliateId: affiliate.id },
      orderBy: { requestedAt: 'desc' },
      skip,
      take: limit,
    });
    res.json({ status: 'success', data: payouts });
  } catch (err) {
    next(err);
  }
});

const payoutSchema = z.object({
  amount: z.number().positive().finite().optional(),
  notes: z.string().max(500).optional().nullable(),
});

// POST /api/affiliates/me/payouts — request a withdrawal of the available
// balance. amount defaults to the full available balance.
router.post('/me/payouts', authenticate, async (req, res, next) => {
  try {
    const body = payoutSchema.parse(req.body ?? {});
    const affiliate = await prisma.affiliate.findUnique({ where: { userId: req.user!.id } });
    if (!affiliate) throw new AppError('You have not joined the affiliate program.', 404);
    if (affiliate.status !== 'active') {
      throw new AppError('Only approved affiliates can request payouts.', 400);
    }

    const settings = await prisma.storeSettings.findUnique({ where: { id: 'default' } });
    const stats = await getAffiliateStats(affiliate.id);
    if (stats.available <= 0) {
      throw new AppError('You have no approved earnings available to withdraw yet.', 400);
    }
    const amount = body.amount !== undefined ? Math.round(body.amount * 100) / 100 : stats.available;
    // A sub-cent amount (e.g. 0.001) rounds to a 0-value payout — refuse
    // rather than create a ledger row for nothing.
    if (amount <= 0) {
      throw new AppError('Payout amount is too small.', 400);
    }
    if (amount > stats.available + 0.005) {
      throw new AppError(`Requested ${amount.toFixed(2)} but only ${stats.available.toFixed(2)} is available.`, 400);
    }

    const openRequest = await prisma.affiliatePayout.findFirst({
      where: { affiliateId: affiliate.id, status: 'pending' },
    });
    if (openRequest) {
      throw new AppError('You already have a pending payout request. The store will review it first.', 400);
    }

    const payout = await prisma.affiliatePayout.create({
      data: {
        affiliateId: affiliate.id,
        amount,
        // Explicit status so the pending-request guard is robust even
        // against DB default handling (and the in-memory test store).
        status: 'pending',
        currency: settings?.currency || 'USD',
        notes: body.notes ?? null,
      },
    });
    res.status(201).json({ status: 'success', data: payout });
  } catch (err) {
    next(err);
  }
});

export default router;
