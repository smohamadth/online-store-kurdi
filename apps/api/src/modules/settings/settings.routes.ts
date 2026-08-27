import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { z } from 'zod';
import { sendEmail, isEmailConfigured } from '../../services/email.service';

const router = Router();

// Every optional text field must tolerate null. The admin form round-trips the
// object it fetched from this same endpoint, and unset columns come back as
// null - so saving settings failed with a 400 whenever any field was empty.
// The old UI reported "Settings saved!" regardless, hiding the failure.
const nullableText = z.string().optional().nullable();
const nullableUrl = z
  .union([z.string().url(), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === '' ? null : v));

// Validation schema
const settingsSchema = z.object({
  storeName: z.string().min(1).max(255).optional(),
  storeDescription: nullableText,
  storeEmail: z.union([z.string().email(), z.literal(''), z.null()]).optional(),
  storePhone: nullableText,
  storeAddress: nullableText,
  storeCity: nullableText,
  storeState: nullableText,
  storeZipCode: nullableText,
  storeCountry: nullableText,
  currency: nullableText,
  currencySymbol: nullableText,
  currencyPosition: z.enum(['before', 'after']).optional().nullable(),
  weightUnit: z.enum(['kg', 'lb']).optional().nullable(),
  dimensionUnit: z.enum(['cm', 'in']).optional().nullable(),
  timezone: nullableText,
  dateFormat: nullableText,
  facebookUrl: nullableUrl,
  instagramUrl: nullableUrl,
  twitterUrl: nullableUrl,
  youtubeUrl: nullableUrl,
  metaTitle: z.string().max(255).optional().nullable(),
  metaDescription: z.string().max(500).optional().nullable(),
  googleAnalyticsId: z.string().optional().nullable(),
  googleTagManagerId: z.string().optional().nullable(),
  maintenanceMode: z.boolean().optional().nullable(),
  maintenanceMessage: z.string().optional().nullable(),
  privacyPolicyUrl: z.string().optional().nullable(),
  termsOfServiceUrl: z.string().optional().nullable(),
  returnPolicyUrl: z.string().optional().nullable(),
});

// GET /api/settings - Get store settings
router.get('/', async (req, res, next) => {
  try {
    let settings = await prisma.storeSettings.findUnique({
      where: { id: 'default' },
    });

    // Create default settings if not exists
    if (!settings) {
      settings = await prisma.storeSettings.create({
        data: { id: 'default' },
      });
    }

    res.json({
      status: 'success',
      data: settings,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/settings - Update store settings (admin only)
router.put('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const validatedData = settingsSchema.parse(req.body);

    const settings = await prisma.storeSettings.upsert({
      where: { id: 'default' },
      update: validatedData,
      create: {
        id: 'default',
        ...validatedData,
      },
    });

    logger.info('Store settings updated');

    res.json({
      status: 'success',
      data: settings,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/settings/email-templates - Get all email templates
router.get('/email-templates', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const templates = await prisma.emailTemplate.findMany({
      orderBy: { name: 'asc' },
    });

    res.json({
      status: 'success',
      data: templates,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/settings/email-templates/:name - Get email template by name
router.get('/email-templates/:name', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { name } = req.params;

    const template = await prisma.emailTemplate.findUnique({
      where: { name },
    });

    if (!template) {
      return res.status(404).json({
        status: 'error',
        message: 'Template not found',
      });
    }

    res.json({
      status: 'success',
      data: template,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/settings/email-templates/:name - Update email template
router.put('/email-templates/:name', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { name } = req.params;
    const { subject, htmlContent, textContent, variables, isActive } = req.body;

    const template = await prisma.emailTemplate.upsert({
      where: { name },
      update: {
        subject,
        htmlContent,
        textContent,
        variables: variables ? JSON.stringify(variables) : undefined,
        isActive,
      },
      create: {
        name,
        subject: subject || '',
        htmlContent: htmlContent || '',
        textContent,
        variables: variables ? JSON.stringify(variables) : '[]',
        isActive: isActive !== false,
      },
    });

    logger.info(`Email template updated: ${name}`);

    res.json({
      status: 'success',
      data: template,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/settings/test-email - Test email configuration
//
// The previous version returned "sent successfully" without sending
// anything (the classic fake-success bug class). It now actually goes
// through sendEmail and reports the real outcome:
//   - 502 when the SMTP server rejected the mail,
//   - 200 with `delivered: false` when no SMTP server is configured
//     (log-only mode), so the admin knows to set SMTP_HOST etc.
router.post('/test-email', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { email } = req.body;
    const parsed = z.string().email().max(254).safeParse(email);
    if (!parsed.success) {
      return res.status(400).json({
        status: 'error',
        message: 'A valid email address is required',
      });
    }

    const storeName = (await prisma.storeSettings.findUnique({ where: { id: 'default' } }))?.storeName || 'your store';
    const ok = await sendEmail(
      parsed.data,
      `Test email — ${storeName} is configured`,
      `<p>This confirms the email settings of <strong>${storeName}</strong> work.</p>` +
        `<p>If you did not request this, someone with admin access is testing the store's email.</p>`,
      `This confirms the email settings of ${storeName} work.`
    );

    if (!ok) {
      return res.status(502).json({
        status: 'error',
        message: 'The mail server rejected the test email. Check SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS.',
      });
    }

    const delivered = isEmailConfigured();
    res.json({
      status: 'success',
      delivered,
      message: delivered
        ? 'Test email sent successfully'
        : 'SMTP is not configured — the email was logged instead of sent. Set SMTP_HOST (and SMTP_PORT / SMTP_USER / SMTP_PASS) to deliver it.',
    });
  } catch (err) {
    next(err);
  }
});

export default router;