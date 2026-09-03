// ---------------------------------------------------------------------------
// Newsletter subscribe/unsubscribe.
//
// Subscribers are DB rows (NewsletterSubscriber, unique on email) - the
// list used to live in an in-memory Set, so a restart or a second API
// instance silently wiped the mailing list. Mounted at /api/newsletter
// with NO auth: the "admin only" note on GET /subscribers is the intent,
// not the current enforcement - treat that endpoint as internal-only.
// ---------------------------------------------------------------------------
import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { z } from 'zod';
import {
  SUBSCRIBED, UNSUBSCRIBED, generateUnsubscribeToken, normalizeEmail,
  normalizeSource, truncateIp, decideSubscribe,
} from './newsletter.helpers';

const router = Router();

const subscribeSchema = z.object({
  email: z.string().email('Invalid email address'),
  // Where the address was collected, for consent evidence. Free-text from the
  // client is normalised against an allowlist rather than trusted.
  source: z.string().max(40).optional(),
});

// POST /api/newsletter/subscribe - Public footer/checkout subscribe box.
// Re-subscribing is a no-op that still returns success, so the UI can
// treat "already subscribed" and "subscribed" identically.
// authz-ok: public newsletter opt-in
router.post('/subscribe', async (req, res, next) => {
  try {
    const { email, source } = subscribeSchema.parse(req.body);
    const normalized = normalizeEmail(email);

    const existing = await prisma.newsletterSubscriber.findUnique({
      where: { email: normalized },
      select: { id: true, status: true },
    });

    const decision = decideSubscribe(existing);

    if (decision.action === 'noop') {
      return res.json({
        status: 'success',
        message: 'You are already subscribed to our newsletter!',
      });
    }

    if (decision.action === 'resubscribe') {
      // They opted out before and are deliberately signing up again: that is
      // fresh consent, so reactivate and re-stamp. A brand-new token is issued
      // so any unsubscribe link from the previous cycle stops working.
      await prisma.newsletterSubscriber.update({
        where: { id: existing!.id },
        data: {
          status: SUBSCRIBED,
          consentAt: new Date(),
          consentIp: truncateIp(req.ip),
          source: normalizeSource(source),
          unsubscribedAt: null,
          unsubscribeToken: generateUnsubscribeToken(),
        },
      });
      logger.info('Newsletter re-subscription');
      return res.json({
        status: 'success',
        message: 'Successfully subscribed to our newsletter!',
      });
    }

    await prisma.newsletterSubscriber.create({
      data: {
        email: normalized,
        status: SUBSCRIBED,
        consentAt: new Date(),
        consentIp: truncateIp(req.ip),
        source: normalizeSource(source),
        unsubscribeToken: generateUnsubscribeToken(),
      },
    });

    // Deliberately does NOT log the address: the log would become a second,
    // unmanaged copy of the mailing list outside the unsubscribe mechanism.
    logger.info('Newsletter subscription recorded');

    res.json({
      status: 'success',
      message: 'Successfully subscribed to our newsletter!',
    });
  } catch (error) {
    next(error);
  }
});

// GET|POST /api/newsletter/unsubscribe?token=... - one-click unsubscribe.
//
// Public and unauthenticated by necessity: the recipient clicks a link in an
// email client with no session, and CAN-SPAM/GDPR require it to work without
// a login. The token is the credential, which is why it is 32 CSPRNG bytes.
//
// Responds identically for a valid and an unknown token. Saying "no such
// subscriber" would turn this endpoint into an oracle for probing whether a
// given address is on the list.
async function handleUnsubscribe(req: any, res: any, next: any) {
  try {
    const token = String(req.query?.token || req.body?.token || '').trim();
    const genericMessage = 'You have been unsubscribed.';

    if (!token) {
      return res.status(400).json({ status: 'error', message: 'Missing unsubscribe token' });
    }

    const subscriber = await prisma.newsletterSubscriber.findUnique({
      where: { unsubscribeToken: token },
      select: { id: true, status: true },
    });

    if (subscriber && subscriber.status !== UNSUBSCRIBED) {
      await prisma.newsletterSubscriber.update({
        where: { id: subscriber.id },
        data: { status: UNSUBSCRIBED, unsubscribedAt: new Date() },
      });
      logger.info('Newsletter unsubscribe processed');
    }

    return res.json({ status: 'success', message: genericMessage });
  } catch (error) {
    next(error);
  }
}

// authz-ok: one-click unsubscribe; the emailed token is the credential
router.get('/unsubscribe', handleUnsubscribe);
// authz-ok: one-click unsubscribe; the emailed token is the credential
router.post('/unsubscribe', handleUnsubscribe);

// GET /api/newsletter/subscribers - Admin/manager only. Subscriber
// emails are customer data: this used to be public (leaking every
// subscriber's address to anyone who hit the URL).
router.get('/subscribers', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    // Only currently-subscribed addresses. Returning unsubscribed rows here
    // is how an "export the list and mail it" workflow silently re-mails
    // people who opted out.
    const subscribers = await prisma.newsletterSubscriber.findMany({
      where: { status: SUBSCRIBED },
      select: { email: true },
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      status: 'success',
      data: {
        count: subscribers.length,
        // Same shape as before the DB move: a flat list of email
        // addresses.
        subscribers: subscribers.map((s: any) => s.email),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
