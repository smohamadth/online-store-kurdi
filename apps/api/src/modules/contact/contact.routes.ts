// ---------------------------------------------------------------------------
// Contact form.
//
// Messages live in an in-memory array (no ContactMessage model exists yet),
// so they are lost on restart and only exist inside a single API process.
// The POST endpoint is public (the storefront contact form); the GET
// endpoint exists for the admin UI - note it is NOT auth-guarded in this
// file and at the mount in app.ts, so treat it as internal-only.
// ---------------------------------------------------------------------------
import { Router } from 'express';
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

// Public form payload. The message floor (10 chars) is a light spam filter;
// the caps keep one request from eating unbounded memory in the array above.
const contactSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  subject: z.string().min(1).max(200),
  message: z.string().min(10).max(5000),
});

// POST /api/contact - Submit contact form (public)
router.post('/', async (req, res, next) => {
  try {
    // Zod throws a ZodError on bad input; the global error handler turns
    // that into a 400, so a malformed form never reaches the array.
    const data = contactSchema.parse(req.body);

    const message = {
      // Good enough for an in-memory list: monotonically increasing.
      id: Date.now().toString(),
      ...data,
      createdAt: new Date(),
    };

    contactMessages.push(message);

    // Logged (not emailed) - the storefront copy promises a human reply,
    // so the admin reads the feed in the admin UI.
    logger.info(`Contact form submitted by ${data.email}: ${data.subject}`);

    res.json({
      status: 'success',
      message: 'Your message has been received. We will get back to you within 24 hours.',
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/contact - Get all messages.
// NOTE: the "(admin)" intent is not enforced - see the header above.
router.get('/', async (req, res, next) => {
  try {
    res.json({
      status: 'success',
      // Newest first for the admin feed.
      data: contactMessages.reverse(),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
