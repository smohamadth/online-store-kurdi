// ---------------------------------------------------------------------------
// Newsletter subscribe/unsubscribe.
//
// Subscribers live in an in-memory Set (no model yet), so the list is lost
// on restart and is per-process. Mounted at /api/newsletter with NO auth -
// the "admin only" note on GET /subscribers below is the intent, not the
// current enforcement; treat that endpoint as internal-only.
// ---------------------------------------------------------------------------
import { Router } from 'express';
import { logger } from '../../utils/logger';
import { z } from 'zod';

const router = Router();

// Simple in-memory storage for newsletter subscribers (until we add a model)
const subscribers = new Set<string>();

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
    if (subscribers.has(email)) {
      return res.json({
        status: 'success',
        message: 'You are already subscribed to our newsletter!',
      });
    }

    // Add to subscribers
    subscribers.add(email);

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
    res.json({
      status: 'success',
      data: {
        count: subscribers.size,
        subscribers: Array.from(subscribers),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
