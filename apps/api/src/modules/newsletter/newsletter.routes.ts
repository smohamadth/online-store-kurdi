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

    // Check if already subscribed
    const existing = await prisma.newsletterSubscriber.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      return res.json({
        status: 'success',
        message: 'You are already subscribed to our newsletter!',
      });
    }

    await prisma.newsletterSubscriber.create({
      data: { email },
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

// GET /api/newsletter/subscribers - Intended for the admin UI.
// NOTE: the "(admin only)" intent is not enforced - see the header above.
router.get('/subscribers', async (req, res, next) => {
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
