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

const router = Router();

const subscribeSchema = z.object({
  email: z.string().email('Invalid email address'),
});

// POST /api/newsletter/subscribe - Public footer/checkout subscribe box.
// Re-subscribing is a no-op that still returns success, so the UI can
// treat "already subscribed" and "subscribed" identically.
router.post('/subscribe', async (req, res, next) => {
  try {
    const { email } = subscribeSchema.parse(req.body);
    // Emails are case-insensitive: 'A@X.com' and 'a@x.com' are the same
    // mailbox, so store the lowercase form or one subscriber could end up
    // on the list twice (two rows, two mailings).
    const normalized = email.trim().toLowerCase();

    // Check if already subscribed
    const existing = await prisma.newsletterSubscriber.findUnique({
      where: { email: normalized },
      select: { id: true },
    });
    if (existing) {
      return res.json({
        status: 'success',
        message: 'You are already subscribed to our newsletter!',
      });
    }

    await prisma.newsletterSubscriber.create({
      data: { email: normalized },
    });

    logger.info(`Newsletter subscription: ${email}`);

    res.json({
      status: 'success',
      message: 'Successfully subscribed to our newsletter!',
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/newsletter/subscribers - Admin/manager only. Subscriber
// emails are customer data: this used to be public (leaking every
// subscriber's address to anyone who hit the URL).
router.get('/subscribers', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const subscribers = await prisma.newsletterSubscriber.findMany({
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
