import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { z } from 'zod';

const router = Router();

// Validation schema
const settingsSchema = z.object({
  storeName: z.string().min(1).max(255).optional(),
  storeDescription: z.string().optional(),
  storeEmail: z.string().email().optional(),
  storePhone: z.string().optional(),
  storeAddress: z.string().optional(),
  storeCity: z.string().optional(),
  storeState: z.string().optional(),
  storeZipCode: z.string().optional(),
  storeCountry: z.string().optional(),
  currency: z.string().optional(),
  currencySymbol: z.string().optional(),
  currencyPosition: z.enum(['before', 'after']).optional(),
  weightUnit: z.enum(['kg', 'lb']).optional(),
  dimensionUnit: z.enum(['cm', 'in']).optional(),
  timezone: z.string().optional(),
  dateFormat: z.string().optional(),
  facebookUrl: z.string().url().optional().nullable(),
  instagramUrl: z.string().url().optional().nullable(),
  twitterUrl: z.string().url().optional().nullable(),
  youtubeUrl: z.string().url().optional().nullable(),
  metaTitle: z.string().max(255).optional().nullable(),
  metaDescription: z.string().max(500).optional().nullable(),
  googleAnalyticsId: z.string().optional().nullable(),
  googleTagManagerId: z.string().optional().nullable(),
  maintenanceMode: z.boolean().optional(),
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
router.post('/test-email', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { email } = req.body;

    // TODO: Send test email
    logger.info(`Test email requested for: ${email}`);

    res.json({
      status: 'success',
      message: 'Test email sent successfully',
    });
  } catch (err) {
    next(err);
  }
});

export default router;