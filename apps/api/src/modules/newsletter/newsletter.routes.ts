import { Router } from 'express';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { z } from 'zod';

const router = Router();

// Simple in-memory storage for newsletter subscribers (until we add a model)
const subscribers = new Set<string>();

const subscribeSchema = z.object({
  email: z.string().email('Invalid email address'),
});

// POST /api/newsletter/subscribe
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

// GET /api/newsletter/subscribers (admin only)
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
