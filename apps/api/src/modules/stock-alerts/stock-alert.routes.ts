// ---------------------------------------------------------------------------
// Stock alerts ("notify me when back in stock").
//
// Subscriptions are DB rows (StockAlertSubscription), keyed per product
// and optionally per product+variant (the variant level is stricter: a
// variant-level alert does not fire for the product as a whole). The
// data used to live in an in-memory Map - lost on restart, per-process,
// so a deploy or a second API instance silently wiped every
// subscription and the "N people want this" counters.
//
// Mounted at /api/stock-alerts with NO auth at the route or mount level -
// the authenticate import below is currently unused (kept for the day a
// guard is added), which also means any caller can subscribe on a user's
// behalf. Treat as public-but-durable until a guard lands.
// ---------------------------------------------------------------------------
import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { z } from 'zod';

void authenticate; // imported for the (not-yet-added) auth guard - see header

const router = Router();

const alertSchema = z.object({
  productId: z.string(),
  variantId: z.string().optional(),
  email: z.string().email().optional(),
});

// The alert "key" as a prisma where-fragment: a product-level alert has
// variantId null; a variant-level alert names the variant. Matching
// variantId: null vs variantId: 'x' keeps the two levels apart, exactly
// like the old "<productId>" vs "<productId>-<variantId>" string keys.
const keyWhere = (productId: string, variantId?: string) => ({
  productId,
  variantId: variantId || null,
});

// POST /api/stock-alerts - Subscribe to a stock alert.
// Authenticated users subscribe by user id; guests by email. A duplicate
// (same user OR same email on the same key) is a no-op that returns
// success, so the UI can safely re-send.
router.post('/', async (req, res, next) => {
  try {
    const data = alertSchema.parse(req.body);
    const userId = req.user?.id || 'anonymous';
    const email = data.email || req.user?.email || '';

    // Dedupe identity. Guests ALL share the 'anonymous' userId, so the
    // dedupe check must be keyed by EMAIL for guests — using the shared
    // userId would make the first guest subscription on a product
    // silently block every later guest with a different email (they'd
    // get "already subscribed" and never an alert).
    const identityWhere = userId !== 'anonymous'
      ? { userId }
      : email
        ? { email }
        : { userId: '' }; // no usable identity: never collides

    // Check if already subscribed (same key: product + optional variant)
    const existing = await prisma.stockAlertSubscription.findFirst({
      where: {
        ...keyWhere(data.productId, data.variantId),
        ...identityWhere,
      },
      select: { id: true },
    });
    if (existing) {
      return res.json({
        status: 'success',
        message: 'You are already subscribed to stock alerts for this product',
      });
    }

    await prisma.stockAlertSubscription.create({
      data: {
        userId,
        email,
        productId: data.productId,
        variantId: data.variantId || null,
      },
    });

    logger.info(`Stock alert subscription: ${email} for product ${data.productId}`);

    res.json({
      status: 'success',
      message: 'You will be notified when this product is back in stock',
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/stock-alerts/check/:productId - Does anyone have an alert on this
// product/variant? (No auth: the storefront shows a "N people want this"
// style hint.) Returns a count, never the subscriber identities.
router.get('/check/:productId', async (req, res, next) => {
  try {
    const { productId } = req.params;
    const variantId = req.query.variantId as string;

    const alertCount = await prisma.stockAlertSubscription.count({
      where: keyWhere(productId, variantId),
    });

    res.json({
      status: 'success',
      data: {
        hasAlerts: alertCount > 0,
        alertCount,
      },
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/stock-alerts/:productId - Unsubscribe.
// Removes EVERY alert for the caller (matched by user id OR email) on that
// key, so re-subscribing after an unsubscribe starts fresh. Guests pass
// their email as a query param because they have no user id. Always returns
// success - unsubscribing something you were never subscribed to is fine.
router.delete('/:productId', async (req, res, next) => {
  try {
    const { productId } = req.params;
    const userId = req.user?.id || 'anonymous';
    const email = req.user?.email || (req.query.email as string) || '';

    const variantId = req.query.variantId as string;

    await prisma.stockAlertSubscription.deleteMany({
      where: {
        ...keyWhere(productId, variantId),
        OR: [{ userId }, { email }],
      },
    });

    res.json({
      status: 'success',
      message: 'Unsubscribed from stock alerts',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
