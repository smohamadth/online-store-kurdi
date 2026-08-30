// ---------------------------------------------------------------------------
// Stock alerts ("notify me when back in stock").
//
// Subscriptions live in an in-memory Map keyed by product (and optionally
// product+variant), so they are lost on restart and are per-process.
// Mounted at /api/stock-alerts with NO auth at the route or mount level -
// the authenticate import below is currently unused (kept for the day a
// guard is added), which also means any caller can subscribe on a user's
// behalf. Treat as public-but-ephemeral until a model + guard land.
// ---------------------------------------------------------------------------
import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { logger } from '../../utils/logger';
import { z } from 'zod';

void authenticate; // imported for the (not-yet-added) auth guard - see header

const router = Router();

// In-memory stock alert subscriptions, keyed by
// "<productId>" or "<productId>-<variantId>" (the variant level is stricter:
// a variant-level alert does not fire for the product as a whole).
const stockAlerts: Map<string, Array<{
  id: string;
  userId: string;
  email: string;
  productId: string;
  variantId?: string;
  createdAt: Date;
}>> = new Map();

const alertSchema = z.object({
  productId: z.string(),
  variantId: z.string().optional(),
  email: z.string().email().optional(),
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

    const key = data.variantId ? `${data.productId}-${data.variantId}` : data.productId;

    if (!stockAlerts.has(key)) {
      stockAlerts.set(key, []);
    }

    const alerts = stockAlerts.get(key)!;

    // Check if already subscribed
    const existing = alerts.find(a => a.userId === userId || (email && a.email === email));
    if (existing) {
      return res.json({
        status: 'success',
        message: 'You are already subscribed to stock alerts for this product',
      });
    }

    alerts.push({
      id: Date.now().toString(),
      userId,
      email,
      productId: data.productId,
      variantId: data.variantId,
      createdAt: new Date(),
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

    const key = variantId ? `${productId}-${variantId}` : productId;
    const alerts = stockAlerts.get(key) || [];

    res.json({
      status: 'success',
      data: {
        hasAlerts: alerts.length > 0,
        alertCount: alerts.length,
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
    const email = req.user?.email || req.query.email as string;

    const variantId = req.query.variantId as string;
    const key = variantId ? `${productId}-${variantId}` : productId;

    if (stockAlerts.has(key)) {
      const alerts = stockAlerts.get(key)!;
      const filtered = alerts.filter(a => a.userId !== userId && a.email !== email);
      stockAlerts.set(key, filtered);
    }

    res.json({
      status: 'success',
      message: 'Unsubscribed from stock alerts',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
