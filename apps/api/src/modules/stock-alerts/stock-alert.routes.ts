import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { z } from 'zod';

const router = Router();

// In-memory stock alert subscriptions
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

// POST /api/stock-alerts - Subscribe to stock alert
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

// GET /api/stock-alerts/check/:productId - Check if product has alerts
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

// DELETE /api/stock-alerts/:productId - Unsubscribe from stock alert
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
