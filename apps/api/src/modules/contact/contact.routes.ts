import { Router } from 'express';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { z } from 'zod';

const router = Router();

// In-memory storage for contact messages (until we add a model)
const contactMessages: Array<{
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: Date;
}> = [];

const contactSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  subject: z.string().min(1).max(200),
  message: z.string().min(10).max(5000),
});

// POST /api/contact - Submit contact form
router.post('/', async (req, res, next) => {
  try {
    const data = contactSchema.parse(req.body);

    const message = {
      id: Date.now().toString(),
      ...data,
      createdAt: new Date(),
    };

    contactMessages.push(message);

    logger.info(`Contact form submitted by ${data.email}: ${data.subject}`);

    res.json({
      status: 'success',
      message: 'Your message has been received. We will get back to you within 24 hours.',
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/contact - Get all messages (admin)
router.get('/', async (req, res, next) => {
  try {
    res.json({
      status: 'success',
      data: contactMessages.reverse(),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
