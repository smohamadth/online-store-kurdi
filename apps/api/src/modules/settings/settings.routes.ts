// ---------------------------------------------------------------------------
// Store settings (mounted at /api/settings): the single-row 'default'
// settings object every storefront widget reads (store name, currency,
// units, social links, maintenance mode, SEO meta), plus the admin
// email-template editor and a test-email endpoint.
//
// The write path is an upsert with a NOT_NULL_SETTINGS allow-list:
// null/'' on a NOT NULL column means "leave as-is" (the admin form
// round-trips null for unset fields), while nullable columns accept null
// as a real clear. See the comments on toSettingsData - the shape of this
// rule is the reason "Settings saved!" was once a lie.
//
// The public GET also embeds the LIVE capability flags (stripeEnabled)
// rather than stored values, so enabling Stripe in .env shows up in the
// checkout without any stored flag to update.
// ---------------------------------------------------------------------------
import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { sendEmail, isEmailConfigured } from '../../services/email.service';
import { isStripeConfigured } from '../../config/stripe';
import {
  getEnabledGateways,
  getGatewayConfigs,
  saveGatewayConfigs,
  clearGatewayConfig,
} from '../payments/gatewayConfig';
import { GATEWAYS, resolveGatewayId } from '../payments/gateways/registry';

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
  // Affiliate marketing program: master switch + default commission rate.
  affiliateEnabled: z.boolean().optional().nullable(),
  affiliateRate: z.number().min(0).max(100).optional().nullable(),
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
      data: {
        ...settings,
        // Capability flag, not a setting: the storefront uses it to
        // decide whether the card option exists in checkout. Always
        // reflects the live env so a merchant adding Stripe keys is
        // live on the next page load, no cache to bust.
        stripeEnabled: isStripeConfigured(),
        // Secret-free list of payment gateways with their enabled status,
        // so the checkout can offer exactly what the admin configured.
        // Credentials never leave the server (see gatewayConfig.ts).
        paymentGateways: await getEnabledGateways(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// Columns that are NOT NULL in the DB (defaults, no `?` in the schema).
// The admin form round-trips null for unset values; writing null into a
// NOT NULL column is a type error, and there is no meaningful "clear"
// for these, so null/'' on them means "leave the current value".
// Nullable columns DO accept null (that clears the field).
const NOT_NULL_SETTINGS = new Set([
  'storeName', 'storeEmail', 'storeCountry',
  'currency', 'currencySymbol', 'currencyPosition', 'enabledCurrencies',
  'weightUnit', 'dimensionUnit', 'timezone', 'dateFormat',
  'maintenanceMode', 'affiliateEnabled', 'affiliateRate',
]);

// Intersecting the create and update inputs leaves only plain scalar
// fields (no `set:`-style update operations), so the result is valid
// for BOTH sides of the upsert.
type SettingsWriteInput = Prisma.StoreSettingsCreateInput &
  Prisma.StoreSettingsUpdateInput;

function toSettingsData(row: z.infer<typeof settingsSchema>): SettingsWriteInput {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === undefined) continue;
    if (value === '' || value === null) {
      if (!NOT_NULL_SETTINGS.has(key)) data[key] = null;
      continue;
    }
    data[key] = value;
  }
  // The filter above guarantees no null lands on a NOT NULL column.
  return data as SettingsWriteInput;
}

// PUT /api/settings - Update store settings (admin only)
router.put('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const validatedData = settingsSchema.parse(req.body);
    const settingsData = toSettingsData(validatedData);

    // Currency change awareness: store credit is per-currency and gift
    // cards carry their issue currency, so switching the store currency
    // strands every balance/card in the old currency (checkout reads
    // only the store currency). Record the old value so the response
    // can warn with exact numbers when anything would be stranded.
    const previous = await prisma.storeSettings.findUnique({ where: { id: 'default' } });
    const oldCurrency = (previous as any)?.currency ?? null;
    const newCurrency = settingsData.currency ?? oldCurrency;

    const settings = await prisma.storeSettings.upsert({
      where: { id: 'default' },
      update: settingsData,
      create: {
        id: 'default',
        ...settingsData,
      },
    });

    logger.info('Store settings updated');

    // Compute the stranded-balance warning (additive; never fails the save).
    let walletWarning: {
      message: string;
      storeCreditBalances: { currency: string; balance: number }[];
      activeGiftCards: number;
    } | null = null;
    if (oldCurrency && newCurrency && oldCurrency.toUpperCase() !== newCurrency.toUpperCase()) {
      const [creditRows, giftCards] = await Promise.all([
        prisma.storeCredit.findMany({
          where: { currency: { not: newCurrency } },
          select: { currency: true, balance: true },
        }),
        prisma.giftCard.findMany({
          where: { currency: { not: newCurrency }, status: 'active' },
          select: { id: true },
        }),
      ]);
      const balances = (creditRows || [])
        .filter((r: any) => Number(r.balance) > 0)
        .map((r: any) => ({ currency: r.currency, balance: Number(r.balance) }));
      if (balances.length > 0 || (giftCards || []).length > 0) {
        walletWarning = {
          message:
            `The store currency changed from ${oldCurrency} to ${newCurrency}. ` +
            'Existing store-credit balances in other currencies and active gift cards ' +
            'issued in other currencies can no longer be spent at checkout — convert or ' +
            're-issue them, or the value sits unused.',
          storeCreditBalances: balances,
          activeGiftCards: (giftCards || []).length,
        };
      }
    }

    res.json({
      status: 'success',
      data: {
        ...settings,
        ...(walletWarning ? { walletWarning } : {}),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Payment gateway configuration (admin only).
//
// GET returns the full config (secret keys included) so the admin form can
// populate the fields; PUT saves; DELETE clears a single gateway. The public
// GET /api/settings returns only the scrubbed metadata from getEnabledGateways.
// ---------------------------------------------------------------------------
const gatewayWriteSchema = z.object({
  gateways: z.record(z.any()).optional(),
});

// GET /api/settings/payment-gateways - full config + field metadata (admin)
router.get('/payment-gateways', authenticate, authorize('admin'), async (_req, res, next) => {
  try {
    const configs = await getGatewayConfigs();
    res.json({
      status: 'success',
      data: {
        gateways: configs,
        definitions: GATEWAYS.map((g) => ({
          id: g.id,
          name: g.name,
          label: g.label,
          country: g.country,
          description: g.description,
          currencyHint: g.currencyHint,
          fields: g.fields,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/settings/payment-gateways - save gateway configs (admin)
router.put('/payment-gateways', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const parsed = gatewayWriteSchema.parse(req.body);
    const next = await saveGatewayConfigs(parsed.gateways || {});
    logger.info('Payment gateway configuration updated');
    res.json({ status: 'success', data: { gateways: next } });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/settings/payment-gateways/:gatewayId - clear one gateway (admin)
router.delete('/payment-gateways/:gatewayId', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const id = resolveGatewayId(req.params.gatewayId);
    if (!id) {
      return res.status(400).json({ status: 'error', message: 'Unknown payment gateway.' });
    }
    await clearGatewayConfig(id);
    res.json({ status: 'success', message: 'Gateway configuration cleared.' });
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