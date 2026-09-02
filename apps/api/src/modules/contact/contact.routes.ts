// ---------------------------------------------------------------------------
// Contact form.
//
// Messages are DB rows (ContactMessage) - they used to live in a
// module-level array, lost on every restart and invisible to a second
// API instance. The POST endpoint is public (the storefront contact
// form); the GET endpoint feeds the admin UI. Note the GET is NOT
// auth-guarded in this file or at the mount in app.ts - treat it as
// internal-only (same exposure as before the DB move).
// ---------------------------------------------------------------------------
import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { z } from 'zod';

const router = Router();

// Public form payload. The message floor (10 chars) is a light spam filter;
// the caps keep one request from storing unbounded text.
const contactSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  subject: z.string().min(1).max(200),
  message: z.string().min(10).max(5000),
});

// POST /api/contact - Submit contact form (public)
// authz-ok: public contact form
router.post('/', async (req, res, next) => {
  try {
    // Zod throws a ZodError on bad input; the global error handler turns
    // that into a 400, so a malformed form never reaches the database.
    const data = contactSchema.parse(req.body);

    await prisma.contactMessage.create({
      data,
    });

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

// GET /api/contact - Get all messages (newest first). Admin/manager
// only: messages carry customer names, emails and phone numbers, and
// this endpoint used to be public (leaking every message).
router.get('/', authenticate, authorize('admin', 'manager'), async (req, res, next) => {
  try {
    const messages = await prisma.contactMessage.findMany({
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      status: 'success',
      data: messages,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
