/**
 * Marketing operations API (mounted at /api/marketing).
 *
 * Abandoned-cart sweep control + recovery reporting, and the email-capture
 * endpoint behind the exit-intent popup.
 */
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { runAbandonedCartSweep } from './abandonedCart.service';
import {
  normalizeEmail, generateUnsubscribeToken, truncateIp, normalizeSource,
  SUBSCRIBED, decideSubscribe,
} from '../newsletter/newsletter.helpers';

const router = Router();

// ---------------------------------------------------------------------------
// Abandoned-cart sweep.
//
// Admin-triggered (and cron-triggerable) rather than an implicit timer, so a
// store can run it on their own schedule and can dry-run it first.
// ---------------------------------------------------------------------------
router.post('/abandoned-carts/run', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const dryRun = req.body?.dryRun === true || req.query?.dryRun === 'true';
    const result = await runAbandonedCartSweep({ dryRun });
    res.json({ status: 'success', data: { dryRun, ...result } });
  } catch (err) {
    next(err);
  }
});

// Recovery reporting: sent vs recovered, so the feature can be judged on
// revenue rather than on volume of email.
router.get('/abandoned-carts/stats', authenticate, authorize('admin', 'manager'), async (_req, res, next) => {
  try {
    const rows = await prisma.abandonedCartEmail.findMany({});
    const sent = rows.length;
    const recovered = (rows as any[]).filter((r) => r.recoveredAt).length;
    const recoveredValue = (rows as any[])
      .filter((r) => r.recoveredAt)
      .reduce((s, r) => s + Number(r.cartValue || 0), 0);

    res.json({
      status: 'success',
      data: {
        sent,
        recovered,
        // Guard the divide: an empty table must report 0, not NaN.
        recoveryRate: sent > 0 ? Number((recovered / sent).toFixed(4)) : 0,
        recoveredValue: Number(recoveredValue.toFixed(2)),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Email capture (exit-intent / welcome-discount popup).
//
// The newsletter previously had no acquisition mechanism at all. Capturing an
// address here also subscribes it, through the same consent-recording path as
// the footer form - so a captured address is as unsubscribable as any other.
// ---------------------------------------------------------------------------
const captureSchema = z.object({
  email: z.string().email('Invalid email address'),
  trigger: z.enum(['exit_intent', 'timed', 'inline']).optional(),
});

// authz-ok: public email capture from the storefront popup
router.post('/capture', async (req, res, next) => {
  try {
    const { email, trigger } = captureSchema.parse(req.body);
    const normalized = normalizeEmail(email);

    // Record the capture event for funnel reporting.
    await prisma.emailCapture.create({
      data: { email: normalized, trigger: trigger ?? 'exit_intent' },
    });

    // ...and put them on the list with a full consent record. Capturing an
    // address without this would recreate exactly the unmailable-list problem
    // the newsletter consent work fixed.
    const existing = await prisma.newsletterSubscriber.findUnique({
      where: { email: normalized },
      select: { id: true, status: true },
    });
    const decision = decideSubscribe(existing);

    if (decision.action === 'create') {
      await prisma.newsletterSubscriber.create({
        data: {
          email: normalized,
          status: SUBSCRIBED,
          consentAt: new Date(),
          consentIp: truncateIp(req.ip),
          source: normalizeSource('popup'),
          unsubscribeToken: generateUnsubscribeToken(),
        },
      });
    } else if (decision.action === 'resubscribe') {
      await prisma.newsletterSubscriber.update({
        where: { id: existing!.id },
        data: {
          status: SUBSCRIBED,
          consentAt: new Date(),
          consentIp: truncateIp(req.ip),
          source: normalizeSource('popup'),
          unsubscribedAt: null,
          unsubscribeToken: generateUnsubscribeToken(),
        },
      });
    }

    logger.info('Email capture recorded');
    res.status(201).json({ status: 'success', message: 'Thanks! Check your inbox.' });
  } catch (err) {
    next(err);
  }
});

// Capture funnel stats for the admin dashboard.
router.get('/capture/stats', authenticate, authorize('admin', 'manager'), async (_req, res, next) => {
  try {
    const captures = await prisma.emailCapture.findMany({});
    const byTrigger: Record<string, number> = {};
    for (const c of captures as any[]) {
      byTrigger[c.trigger] = (byTrigger[c.trigger] ?? 0) + 1;
    }
    res.json({
      status: 'success',
      data: { total: captures.length, byTrigger },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
